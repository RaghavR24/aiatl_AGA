from google.cloud import speech
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import AudioFile
from .serializers import AudioFileSerializer
import openai
from django.shortcuts import render
from django.core.cache import cache
from django.conf import settings
import json
from supabase import create_client
import uuid
from datetime import datetime


# Initialize Sentence-BERT model for similarity
model = SentenceTransformer('all-MiniLM-L6-v2')

# Set up your OpenAI API key
openai.api_key = settings.OPENAI_API_KEY
supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

def mind_map_view(request):
    return render(request, 'core/mindmap.html')

def generate_openai_embedding(text):
    response = openai.Embedding.create(input=text, model="text-embedding-ada-002")
    return response["data"][0]["embedding"]

class UploadTextView(APIView):  # Changed the view name to UploadTextView for testing with text
    def post(self, request, *args, **kwargs):
        # Get transcribed text from the POST request instead of handling audio for now
        transcribed_text = request.data.get('transcription')
        # print(f"Transcribed Text: {transcribed_text}")
        user_id = request.data.get('user_id') #harcoded for now, will be dynamic later - request.user.id
        print(f"User ID: {user_id}")

        if not transcribed_text:
            return Response({"error": "No transcription provided."}, status=400)
        
        existing_main_topics = self.get_existing_main_topics(user_id)

        json_output = self.generate_topic_structure(transcribed_text, existing_main_topics)
        self.parse_gpt_output(json_output, user_id)

        cache.set(f'latest_mind_map_{user_id}', {"status: processed"}, timeout=None)

        return Response(status=200)
    
    def get_existing_main_topics(self, user_id):
        """Fetch all existing main topics for a user from the database."""
        response = supabase.table('MindMapNode').select("*").eq("user_id", user_id).eq("type", "main").execute()
        main_topics = [topic["name"] for topic in response.data] if response.data else []
        return main_topics

    # Use GPT-4 to segment the transcription
    def generate_topic_structure(self, transcription, existing_main_topics):
        """Generate topic structure with existing main topics included in the prompt."""
        existing_main_topics_str = "\n".join(f"- {topic}" for topic in existing_main_topics) or "None"
        prompt = f"""
        Break the following transcription down into main topics, subtopics, and detailed information points.
        Each main topic is the primary subject, each subtopic is a subcategory under the main topic, and each information point is a specific detail related to the subtopic from the transcription.
        If the transcription mentions anything that is very similar to an existing main topic, use that instead of creating a new one.
        Return the result as a valid JSON object structured like this:
        {{
            "main_topics": [
                {{
                    "name": "Main Topic",
                    "subtopics": [
                        {{
                            "name": "Subtopic",
                            "details": ["Detail 1", "Detail 2"]
                        }}
                    ]
                }}
            ]
        }}
        Here are the existing main topics:
        {existing_main_topics_str}

        Here is the transcription:
        {transcription}
        """

        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",  # Or "gpt-4"
            messages=[
                {"role": "user", "content": prompt}
            ],
            max_tokens=1000,
            temperature=0.7
        )

        # Extract the structured output
        structured_output = response['choices'][0]['message']['content']

        # Log the output to inspect it
        # print("GPT-4 Structured Output: ", structured_output)

        return structured_output

    # Parse the output from GPT-4 into segments (main topics, subtopics, info points)
    def parse_gpt_output(self, json_output, user_id):
        print("GPT-4 JSON Output: ", json_output)
        try:
            mind_map_data = json.loads(json_output)
            nodes, edges = [], []

            all_subtopics = []

            for main_topic in mind_map_data.get("main_topics", []):
                main_topic_embedding = generate_openai_embedding(main_topic["name"])

                # Check if main topic already exists
                existing_main_topic = self.find_similar_topic(main_topic_embedding, user_id, topic_type="main", threshold=0.95)
                if existing_main_topic:
                    main_topic_node = existing_main_topic
                else:
                    main_topic_node = self.save_node(user_id, main_topic["name"], "main", main_topic_embedding)
                    if main_topic_node:
                        nodes.append(main_topic_node)
                    else:
                        continue

                # Process subtopics
                for subtopic in main_topic.get("subtopics", []):
                    subtopic_embedding = generate_openai_embedding(subtopic["name"])

                    #checking if similar subtopic already exists
                    existing_subtopic = self.find_similar_topic(subtopic_embedding, user_id, topic_type="subtopic", parent_id=main_topic_node["id"], threshold=0.85)
                    if existing_subtopic:
                        subtopic_node = existing_subtopic
                        new_info_points = [point for point in subtopic.get("details", []) if point not in subtopic_node["info_points"]]
                        if new_info_points:
                            updated_info_points = subtopic_node["info_points"] + new_info_points
                            # Update existing subtopic in database
                            supabase.table("MindMapNode").update({"info_points": updated_info_points}).eq("id", subtopic_node["id"]).execute()
                            subtopic_node["info_points"] = updated_info_points  # Update local representation
                    else:
                        subtopic_node = self.save_node(
                            user_id=user_id,
                            name=subtopic["name"],
                            type="subtopic",
                            embedding=subtopic_embedding,
                            parent_id=main_topic_node["id"],
                            info_points=subtopic.get("details", [])
                        )
                    if subtopic_node:
                        nodes.append(subtopic_node)
                        all_subtopics.append(subtopic_node)
                    else:
                        continue

                    # Create or retrieve edge between main topic and subtopic
                    edges.append(self.save_edge(user_id, main_topic_node["id"], subtopic_node["id"]))

            # checking another subtopic connections
            for i, sub1 in enumerate(all_subtopics):
                for sub2 in all_subtopics[i+1:]:
                    similarity = cosine_similarity([sub1["embedding"]], [sub2["embedding"]])[0][0]
                    if similarity >= 0.6:
                        existing_edge = supabase.table("MindMapEdge").select("*").eq("source_id", sub1["id"]).eq("target_id", sub2["id"]).execute()
                        if existing_edge.data:
                            continue
                        edge = self.save_edge(user_id, sub1["id"], sub2["id"])
                        if edge:
                            edges.append(edge)
                        

            return {"nodes": nodes, "edges": edges}

        except json.JSONDecodeError:
            return {"error": "Invalid JSON format returned from GPT"}

        
    def find_similar_topic(self, embedding, user_id, topic_type="main", parent_id=None, threshold=0.8):
        # Retrieve all topics of the specified type for the user from Supabase
        query = supabase.table("MindMapNode").select("*").eq("user_id", user_id).eq("type", topic_type)
        if parent_id:
            query = query.eq("parent_id", parent_id)
        
        response = query.execute()
        topics = response.data

        # If no topics exist, return None
        if not topics:
            return None

        # Collect embeddings of topics for similarity comparison
        topic_embeddings = [topic["embedding"] for topic in topics]
        # Calculate cosine similarities
        similarities = cosine_similarity([embedding], topic_embeddings)[0]
        max_similarity_index = similarities.argmax()

        # Check if the highest similarity exceeds the threshold
        if similarities[max_similarity_index] >= threshold:
            # Return the most similar topic
            similar_topic = topics[max_similarity_index]
            return similar_topic
        return None
        
    
    def save_node(self, user_id, name, type, embedding, parent_id=None, info_points=None):
        node = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "name": name,
            "type": type,
            "embedding": embedding,
            "info_points": info_points if info_points else [],
            "parent_id": parent_id,
            "edges_to": None,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }
        node = supabase.table("MindMapNode").insert(node).execute()
        return node.data[0]
    
    def save_edge(self, user_id, source_id, target_id):
        edge = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "source_id": source_id,
            "target_id": target_id,
            "created_at": datetime.now().isoformat(),
        }
        edge = supabase.table("MindMapEdge").insert(edge).execute()
        edge_id = edge.data[0]["id"]
        source_node = supabase.table("MindMapNode").select("edges_to").eq("id", source_id).execute()
        current_edges = source_node.data[0]["edges_to"] if source_node.data[0]["edges_to"] else []
        current_edges.append(edge_id)
        updated_node = supabase.table("MindMapNode").update({"edges_to": current_edges}).eq("id", source_id).execute()

        return edge.data[0]


class MindMapView(APIView):
    def get(self, request, *args, **kwargs):
        user_id = request.data.get('user_id') #should be request.user.id
        mind_map = cache.get(f'latest_mind_map_{user_id}')
        if mind_map is None:
            return Response({"error": "No mind map available."}, status=404)
        return Response(mind_map)
