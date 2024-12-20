'use client'

import React from 'react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession, signIn, signOut } from "next-auth/react"
import { Mic, StopCircle, BrainCircuit, CheckSquare, Plus, ChevronDown, ChevronRight, Trash2, LogIn, LogOut, Loader2, Flag, MessageSquare, Send, Check, CameraIcon } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { api } from "@/trpc/react"
import { cn } from "@/lib/utils"
import MindMapModal from "@/components/ui/MindMapModal"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { NodeType } from '@prisma/client';

// Simulated AI function to extract topics from text
const extractTopics = (text: string) => {
  const topics = text.split(' ').filter(word => word.length > 5)
  return topics.slice(0, 5) // Return up to 5 topics
}

// Update the Task type
type Task = {
  id: string;
  text: string;
  priority: number;
  subtasks: Task[];
  isExpanded: boolean;
  isSubtask?: boolean;
};

// Add this new component for a custom SelectItem
const PrioritySelectItem = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof SelectItem> & { icon: React.ReactNode }>(
  ({ className, children, icon, ...props }, ref) => {
    return (
      <SelectItem
        ref={ref}
        className={cn(
          "flex items-center space-x-2 rounded-md p-2",
          className
        )}
        {...props}
      >
        <div className="flex items-center space-x-2 flex-grow">
          {icon}
          <span>{children}</span>
        </div>
      </SelectItem>
    )
  }
)
PrioritySelectItem.displayName = "PrioritySelectItem"

// Add these interfaces at the top of your file
interface Node {
  id: string;
  name: string;
  type: NodeType;
  infoPoints: string[];
}

interface Edge {
  sourceId: string;
  targetId: string;
}

// Add this new function for image compression
const compressImage = async (file: File, maxWidth: number, maxHeight: number): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width *= maxHeight / height;
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);

      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
};

export default function VoiceNotes() {
  const { data: session, status } = useSession()
  const [activeTab, setActiveTab] = useState('voice')
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [topics, setTopics] = useState<string[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [newTask, setNewTask] = useState('')
  const [newTaskPriority, setNewTaskPriority] = useState(3)
  const [isUpsertingText, setIsUpsertingText] = useState(false)
  const [upsertSuccess, setUpsertSuccess] = useState(false)
  const [isExtractingTodos, setIsExtractingTodos] = useState(false)
  const [isLoadingTasks, setIsLoadingTasks] = useState(true)
  const [isAddingTask, setIsAddingTask] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const audioChunks = useRef<Blob[]>([])
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant', content: string }>>([])
  const [currentMessage, setCurrentMessage] = useState('')
  const [streamingMessage, setStreamingMessage] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isIndexingThoughts, setIsIndexingThoughts] = useState(false)
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [isProcessComplete, setIsProcessComplete] = useState(false);
  const [microphonePermission, setMicrophonePermission] = useState<PermissionState | null>(null);
  const [microphoneError, setMicrophoneError] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string>('');
  const [isProcessingImage, setIsProcessingImage] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | ArrayBuffer | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [error, setError] = useState('');

  const saveSpeechToText = api.speech.saveSpeechToText.useMutation()
  const extractAndSaveTodos = api.todo.extractAndSaveTodos.useMutation()
  const createTodo = api.todo.createTodo.useMutation()
  const getUserTodos = api.todo.getUserTodos.useQuery(undefined, {
    enabled: !!session?.user?.id,
  });
  const transcribeAudio = api.transcription.transcribeAudio.useMutation()
  const mindchatMutation = api.mindchat.chat.useMutation()
  const upsertTranscript = api.pinecone.upsertTranscript.useMutation()
  const saveImageToText = api.image.saveImageToText.useMutation({
    onSuccess: (data) => {
      setExtractedText(data.text);
      setUploadSuccess(true);
      setError('');
    },
    onError: (error) => {
      console.error('OCR Error:', error);
      setError('Failed to extract text from the image.');
      setUploadSuccess(false);
    },
  });

  const userId = session?.user?.id ?? ''

  const [mindMapData, setMindMapData] = useState<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const getMindMap = api.mindMap.getMindMap.useQuery(
    { userId: session?.user?.id ?? '' },
    { 
      enabled: !!session?.user?.id,
      refetchOnWindowFocus: false // Disable automatic refetch on window focus
    }
  );

  const priorityOptions = [
    { value: "1", label: "1", color: "text-red-600" },
    { value: "2", label: "2", color: "text-red-500" },
    { value: "3", label: "3", color: "text-orange-500" },
    { value: "4", label: "4", color: "text-orange-400" },
    { value: "5", label: "5", color: "text-yellow-500" },
    { value: "6", label: "6", color: "text-yellow-400" },
    { value: "7", label: "7", color: "text-lime-500" },
    { value: "8", label: "8", color: "text-green-400" },
    { value: "9", label: "9", color: "text-green-500" },
    { value: "10", label: "10", color: "text-green-600" },
  ];

  const getPriorityColor = (priority: number): string => {
    switch (priority) {
      case 1: return "border-red-600";
      case 2: return "border-red-500";
      case 3: return "border-orange-500";
      case 4: return "border-orange-400";
      case 5: return "border-yellow-500";
      case 6: return "border-yellow-400";
      case 7: return "border-lime-500";
      case 8: return "border-green-400";
      case 9: return "border-green-500";
      case 10: return "border-green-600";
      default: return "border-gray-400";
    }
  };

  const getFlagColor = (priority: number): string => {
    switch (priority) {
      case 1: return "text-red-600";
      case 2: return "text-red-500";
      case 3: return "text-orange-500";
      case 4: return "text-orange-400";
      case 5: return "text-yellow-500";
      case 6: return "text-yellow-400";
      case 7: return "text-lime-500";
      case 8: return "text-green-400";
      case 9: return "text-green-500";
      case 10: return "text-green-600";
      default: return "text-gray-400";
    }
  };

  useEffect(() => {
    checkMicrophonePermission().catch(console.error);
  }, []);

  const checkMicrophonePermission = async () => {
    if ('permissions' in navigator) {
      try {
        const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        setMicrophonePermission(result.state);
        result.onchange = () => {
          setMicrophonePermission(result.state);
        };
      } catch (error) {
        console.error('Error checking microphone permission:', error);
        setMicrophonePermission('denied');
      }
    } else {
      console.warn('Permissions API not supported');
      setMicrophonePermission('prompt');
    }
  };

  const requestMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setMicrophonePermission('granted');
    } catch (error) {
      console.error('Error requesting microphone permission:', error);
      setMicrophonePermission('denied');
    }
  };

  useEffect(() => {
    if (getMindMap.data) {
      const mappedData = {
        nodes: getMindMap.data.nodes as Node[],
        edges: getMindMap.data.edges as Edge[]
      };
      setMindMapData(mappedData);
    }
  }, [getMindMap.data]);

  useEffect(() => {
    if (getUserTodos.data) {
      setTasks(getUserTodos.data.map((todo) => ({
        ...todo,
        isExpanded: false,
        subtasks: todo.subtasks.map(subtask => ({
          ...subtask,
          isExpanded: false,
          subtasks: []
        }))
      })));
      setIsLoadingTasks(false);
    }
  }, [getUserTodos.data]);

  useEffect(() => {
    if (microphonePermission === 'granted' && typeof window !== 'undefined' && 'MediaRecorder' in window) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          mediaRecorder.current = new MediaRecorder(stream)
          
          mediaRecorder.current.ondataavailable = (event) => {
            audioChunks.current.push(event.data)
          }

          mediaRecorder.current.onstop = async () => {
            const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' })
            audioChunks.current = []
            
            setProcessingStatus("Processing audio...")
            try {
              const audioFile = new File([audioBlob], "recording.webm", { type: 'audio/webm' })
              
              const reader = new FileReader();
              reader.readAsDataURL(audioFile);
              reader.onloadend = async () => {
                const base64Audio = reader.result as string;
                
                setProcessingStatus("Transcribing audio...")
                const result = await transcribeAudio.mutateAsync({ audio: base64Audio });
                setTranscript(result.text)

                setProcessingStatus("Updating Mind Map...")
                await saveSpeechToText.mutateAsync({ text: result.text })

                setProcessingStatus("Extracting and saving todos...")
                await extractAndSaveTodos.mutateAsync({ text: result.text })

                setProcessingStatus("Indexing your thoughts...")
                await upsertTranscript.mutateAsync({ text: result.text })

                // Refresh the todo list
                void getUserTodos.refetch()

                // Extract topics for mindmap
                const extractedTopics = extractTopics(result.text)
                setTopics(extractedTopics)

                setProcessingStatus("Process completed successfully!")
                setIsProcessComplete(true)
              }
            } catch (error) {
              console.error('Processing error:', error)
              setProcessingStatus("An error occurred. Please try again.")
              setTimeout(() => setProcessingStatus(null), 2000) // Clear the error message after 2 seconds
            }
          }
        })
        .catch(err => {
          console.error('Error accessing microphone:', err);
          setMicrophoneError("Unable to access microphone. Please check your browser settings and try again.");
        });
    }
  }, [microphonePermission]);

  const startRecording = () => {
    setIsRecording(true)
    setProcessingStatus(null)
    setIsProcessComplete(false)
    audioChunks.current = []
    mediaRecorder.current?.start()
  }

  const stopRecording = () => {
    setIsRecording(false)
    setProcessingStatus("Processing audio...")
    mediaRecorder.current?.stop()
  }

  const addTask = async (parentId: string | null = null) => {
    if (newTask.trim()) {
      setIsAddingTask(true)
      try {
        const savedTask = await createTodo.mutateAsync({
          text: newTask,
          priority: newTaskPriority,
          parentId: parentId
        });

        if (parentId) {
          setTasks(tasks.map(task => {
            if (task.id === parentId) {
              return { ...task, subtasks: [...task.subtasks, { ...savedTask, isExpanded: false, subtasks: [] }] };
            }
            return task;
          }));
        } else {
          setTasks(prevTasks => [...prevTasks, { ...savedTask, isExpanded: false, subtasks: [] }]);
        }

        setNewTask('');
        setNewTaskPriority(3);
        // Use void operator to explicitly ignore the promise
        void getUserTodos.refetch();
      } catch (error) {
        console.error('Error adding task:', error);
      } finally {
        setIsAddingTask(false)
      }
    }
  };

  const toggleExpand = (id: string) => {
    setTasks(tasks.map(task => {
      if (task.id === id) {
        return { ...task, isExpanded: !task.isExpanded }
      }
      return task
    }))
  }

  const deleteTodoMutation = api.todo.deleteTodo.useMutation({
    onSuccess: () => {
      // Refetch todos after successful deletion
      void getUserTodos.refetch();
    },
  });

  const deleteTask = async (id: string, parentId: string | null = null) => {
    setDeletingTaskId(id);
    try {
      await deleteTodoMutation.mutateAsync({ id });
      
      // Update the frontend state
      setTasks(prevTasks => {
        const updateSubtasks = (tasks: Task[]): Task[] => {
          return tasks.map(task => ({
            ...task,
            subtasks: task.subtasks.filter(subtask => subtask.id !== id)
          }));
        };

        if (parentId) {
          return prevTasks.map(task => 
            task.id === parentId
              ? { ...task, subtasks: updateSubtasks(task.subtasks) }
              : task
          );
        } else {
          return prevTasks.filter(task => task.id !== id);
        }
      });
    } catch (error) {
      console.error('Error deleting task:', error);
    } finally {
      setDeletingTaskId(null);
    }
  };

  const renderTask = (task: Task, level = 0, parentId: string | null = null) => (
    <li
      key={task.id}
      className={cn(
        `bg-white rounded-xl p-4 mb-2 shadow-sm`,
        `border-l-4`,
        getPriorityColor(task.priority),
        level > 0 ? 'ml-6' : ''
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {task.subtasks.length > 0 && (
            <Button
              onClick={() => toggleExpand(task.id)}
              variant="ghost"
              size="sm"
              className="p-0 h-6 w-6"
            >
              {task.isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </Button>
          )}
          {task.subtasks.length === 0 && <div className="w-6" />}
          <span>{task.text}</span>
          {task.subtasks.length > 0 && (
            <span className="text-xs text-gray-500">
              ({task.subtasks.length} subtask{task.subtasks.length !== 1 ? 's' : ''})
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <Flag className={cn("w-4 h-4", getFlagColor(task.priority))} />
          <Button 
            onClick={() => deleteTask(task.id, parentId)} 
            variant="ghost" 
            size="sm"
            disabled={deletingTaskId === task.id}
          >
            {deletingTaskId === task.id ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
      {task.isExpanded && task.subtasks.length > 0 && (
        <ul className="mt-2 space-y-2">
          {task.subtasks
            .sort((a, b) => a.priority - b.priority)
            .map(subtask => renderTask(subtask, level + 1, task.id))}
        </ul>
      )}
    </li>
  )

  const sendMessage = useCallback(async () => {
    if (currentMessage.trim()) {
      const newUserMessage = { role: 'user' as const, content: currentMessage };
      setChatMessages(prev => [...prev, newUserMessage]);
      setCurrentMessage('');
      setIsStreaming(true);
      setStreamingMessage('');

      try {
        const response = await mindchatMutation.mutateAsync({
          message: currentMessage,
          history: chatMessages
        });

        // Assuming the response is a string, we'll split it into words
        const words = response.split(' ');

        // Simulate streaming by adding words with a delay
        for (const word of words) {
          await new Promise(resolve => setTimeout(resolve, 50)); // Delay between words
          setStreamingMessage(prev => prev + word + ' ');
        }

        setChatMessages(prev => [...prev, { role: 'assistant', content: response }]);
      } catch (error) {
        console.error('Error in Mindchat:', error);
        setChatMessages(prev => [...prev, { role: 'assistant', content: "I'm sorry, I encountered an error. Please try again." }]);
      } finally {
        setIsStreaming(false);
        setStreamingMessage('');
      }
    }
  }, [currentMessage, chatMessages, mindchatMutation]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadSuccess(false);
      setError('');

      try {
        const compressedImage = await compressImage(file, 1024, 1024); // Compress to max 1024x1024
        setPreviewSrc(compressedImage);
      } catch (error) {
        console.error('Error compressing image:', error);
        setError('Failed to compress the image.');
      }
    }
  };

  const handleImageUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !previewSrc) {
      alert('Please select an image file.');
      return;
    }
  
    setIsProcessingImage(true);
    setUploadSuccess(false);
    setError('');
  
    try {
      if (typeof previewSrc !== 'string') {
        throw new Error('Invalid image data');
      }
      const base64Image = previewSrc.split(',')[1]; // Extract base64 data
  
      await saveImageToText.mutateAsync({ 
        image: base64Image!,
        width: 1024,
        height: 1024
      });
  
      setUploadSuccess(true);
    } catch (error) {
      console.error('Error during OCR process:', error);
      setError('An error occurred while processing the image. Please try again.');
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === 'mindmap') {
      void getMindMap.refetch();
    }
  };

  if (status === "loading") {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-100 p-8 flex items-center justify-center">
        <div className="w-full max-w-md bg-white bg-opacity-20 backdrop-filter backdrop-blur-lg rounded-3xl shadow-xl overflow-hidden p-8 text-center">
          <h1 className="text-3xl font-bold mb-6">Welcome to MindMap</h1>
          <p className="mb-6">Please sign in to access your personalized note-taking experience.</p>
          <Button onClick={() => signIn()} className="w-full">
            <LogIn className="w-5 h-5 mr-2" />
            Sign In
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-100 p-4 sm:p-8 flex items-center justify-center">
      <div className="w-full max-w-4xl bg-white bg-opacity-20 backdrop-filter backdrop-blur-lg rounded-3xl shadow-xl overflow-hidden">
        <div className="p-4 flex justify-between items-center bg-white bg-opacity-50">
          <h1 className="text-lg sm:text-xl font-bold">Welcome, {session?.user?.name}</h1>
          <Button onClick={() => signOut()} variant="ghost" size="sm">
            <LogOut className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
            <span className="hidden sm:inline">Sign Out</span>
          </Button>
        </div>
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="flex flex-wrap w-full bg-white bg-opacity-50">
            {[
              { value: "voice", icon: Mic, label: "Voice" },
              { value: "image", icon: CameraIcon, label: "Image" },
              { value: "mindmap", icon: BrainCircuit, label: "Map" },
              { value: "todo", icon: CheckSquare, label: "Todo" },
              { value: "mindchat", icon: MessageSquare, label: "Chat" },
            ].map(({ value, icon: Icon, label }, index) => (
              <TabsTrigger
                key={value}
                value={value}
                className={`flex-1 py-2 px-3 text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:text-black
                            ${index < 3 ? 'w-1/3' : 'w-1/2'}`}
              >
                <Icon className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
                <span>{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="voice" className="p-6">
            <div className="space-y-4 flex flex-col items-center justify-center h-64">
              {microphonePermission === 'denied' ? (
                <div className="text-red-500 text-center">
                  <p>Microphone access is denied. Please enable it in your browser settings.</p>
                </div>
              ) : microphonePermission === 'prompt' ? (
                <Button onClick={requestMicrophonePermission} className="bg-blue-500 text-white">
                  Allow Microphone Access
                </Button>
              ) : microphoneError ? (
                <div className="text-red-500 text-center">{microphoneError}</div>
              ) : (
                <Button
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`
                    w-24 h-24 rounded-full 
                    flex items-center justify-center
                    transition-all duration-300 ease-in-out
                    ${isRecording 
                      ? 'bg-red-50 border-4 border-red-500 text-red-500 animate-pulse' 
                      : 'bg-white border-2 border-casca-blue text-casca-blue hover:bg-casca-blue/10'
                    }
                  `}
                >
                  {isRecording ? (
                    <StopCircle className="w-12 h-12" />
                  ) : (
                    <Mic className="w-12 h-12" />
                  )}
                </Button>
              )}
              {processingStatus && !isProcessComplete && (
                <div className="flex items-center justify-center space-x-2 text-casca-blue">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{processingStatus}</span>
                </div>
              )}
              {isProcessComplete && (
                <div className="flex items-center justify-center space-x-2 text-green-500">
                  <Check className="w-5 h-5" />
                  <span>Process completed successfully!</span>
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent value="mindmap" className="p-6">
            <div className="bg-white bg-opacity-50 rounded-xl p-4 h-[calc(100vh-300px)] overflow-hidden relative">
              {getMindMap.isLoading ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center space-y-4 animate-fade-in">
                    <Loader2 className="w-12 h-12 animate-spin text-casca-blue mx-auto" />
                    <p className="text-lg text-gray-600">Loading mindmap data...</p>
                  </div>
                </div>
              ) : getMindMap.isError ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-lg text-red-600">Error loading mindmap data. Please try again.</p>
                </div>
              ) : mindMapData ? (
                <MindMapModal nodes={mindMapData.nodes} edges={mindMapData.edges} />
              ) : null}
            </div>
          </TabsContent>
          <TabsContent value="todo" className="p-4 sm:p-6">
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                <Input
                  type="text"
                  placeholder="Add a new task"
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  className="flex-grow"
                />
                <Select
                  value={newTaskPriority.toString()}
                  onValueChange={(value) => setNewTaskPriority(parseInt(value))}
                >
                  <SelectTrigger className="w-[180px] bg-white">
                    <SelectValue placeholder="Select priority">
                      <div className="flex items-center space-x-2">
                        <Flag className={getFlagColor(newTaskPriority)} />
                        <span>Priority {newTaskPriority}</span>
                      </div>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {priorityOptions.map((option) => (
                      <SelectItem 
                        key={option.value} 
                        value={option.value}
                        className="hover:bg-gray-100"
                      >
                        <div className="flex items-center space-x-2">
                          <Flag className={option.color} />
                          <span>Priority {option.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={() => addTask()} disabled={isAddingTask} className="w-full sm:w-auto">
                  {isAddingTask ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ) : (
                    <Plus className="w-5 h-5 mr-2" />
                  )}
                  {isAddingTask ? 'Adding...' : 'Add Task'}
                </Button>
              </div>
              {isLoadingTasks ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-8 h-8 animate-spin text-casca-blue" />
                </div>
              ) : (
                <ul className="space-y-2 max-h-[calc(100vh-350px)] sm:max-h-[calc(100vh-250px)] overflow-y-auto pr-4">
                  {tasks
                    .sort((a, b) => a.priority - b.priority)
                    .map(task => renderTask(task))}
                </ul>
              )}
            </div>
          </TabsContent>
          <TabsContent value="mindchat" className="p-6">
            <div className="space-y-4 h-[calc(100vh-250px)] flex flex-col">
              <div className="flex-grow overflow-y-auto space-y-4 p-4 bg-white bg-opacity-50 rounded-xl">
                {chatMessages.map((message, index) => (
                  <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] p-3 rounded-xl ${message.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}>
                      {message.content}
                    </div>
                  </div>
                ))}
                {isStreaming && (
                  <div className="flex justify-start">
                    <div className="max-w-[70%] p-3 rounded-xl bg-gray-200">
                      {streamingMessage}
                      <span className="animate-pulse">▋</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex space-x-2 -mt-4"> {/* Added negative top margin */}
                <Input
                  type="text"
                  placeholder="Chat with your memories..."
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  className="flex-grow"
                />
                <Button onClick={sendMessage} disabled={isStreaming}>
                  <Send className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="image" className="p-4 sm:p-6">
            <div className="space-y-4 flex flex-col items-center justify-center min-h-[300px]">
              <form onSubmit={handleImageUpload} className="flex flex-col items-center space-y-4 w-full max-w-md">
                <label className="flex flex-col items-center cursor-pointer">
                  <CameraIcon className="w-16 h-16 text-gray-500 mb-2 hover:text-gray-700 transition-colors" />
                  <span className="text-sm text-gray-600">Click to upload an image</span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleFileChange} 
                    className="hidden" 
                  />
                </label>
                {previewSrc && (
                  <div className="w-full max-w-xs overflow-hidden rounded-lg border border-gray-300 shadow">
                    <img
                      src={previewSrc as string}
                      alt="Selected Preview"
                      className="object-contain w-full"
                    />
                  </div>
                )}
                <Button 
                  type="submit" 
                  disabled={isProcessingImage || !selectedFile} 
                  className="w-full max-w-xs h-12 flex items-center justify-center rounded-lg bg-white text-black border border-black hover:bg-gray-100 transition-colors"
                >
                  {isProcessingImage ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5 mr-2" />
                      Extract Text
                    </>
                  )}
                </Button>
              </form>
              {uploadSuccess && (
                <div className="text-green-600 font-semibold mt-2 text-center">
                  Image processed successfully!
                </div>
              )}
              {error && (
                <div className="text-red-600 font-semibold mt-2 text-center">
                  Error: {error}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
