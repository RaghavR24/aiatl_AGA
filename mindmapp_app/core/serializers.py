# core/serializers.py
from rest_framework import serializers
from .models import AudioFile  # Import your model

class AudioFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = AudioFile  # Reference your model here
        fields = ['title', 'file', 'transcription', 'created_at']