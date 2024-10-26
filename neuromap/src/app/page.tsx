'use client'

import React from 'react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession, signIn, signOut } from "next-auth/react"
import { Mic, StopCircle, BrainCircuit, CheckSquare, Plus, ChevronDown, ChevronRight, Trash2, LogIn, LogOut, Loader2, Flag, MessageSquare, Send, Check } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { api } from "@/trpc/react"
import { cn } from "@/lib/utils"
import MindMapGraph from "@/components/ui/MindMapGraph"
import MindMapModal from "@/components/ui/MindMapModal"

// Simulated AI function to extract topics from text
const extractTopics = (text: string) => {
  const topics = text.split(' ').filter(word => word.length > 5)
  return topics.slice(0, 5) // Return up to 5 topics
}

// Update the Task type to match the structure from the server
type Task = {
  id: string;
  text: string;
  priority: number;
  subtasks: Task[];
  isExpanded: boolean;
  isSubtask?: boolean; // Add this to match the server response
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

export default function VoiceNotes() {
  const { data: session, status } = useSession()
  const [activeTab, setActiveTab] = useState('voice')
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [topics, setTopics] = useState<string[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [newTask, setNewTask] = useState('')
  const [newTaskPriority, setNewTaskPriority] = useState(3)
  const recognitionRef = useRef<any>(null)
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

  const saveSpeechToText = api.speech.saveSpeechToText.useMutation()
  const extractAndSaveTodos = api.todo.extractAndSaveTodos.useMutation()
  const createTodo = api.todo.createTodo.useMutation()
  const getUserTodos = api.todo.getUserTodos.useQuery(undefined, {
    enabled: !!session?.user?.id,
  });
  const transcribeAudio = api.transcription.transcribeAudio.useMutation()
  const mindchatMutation = api.mindchat.chat.useMutation()
  const upsertTranscript = api.pinecone.upsertTranscript.useMutation()

  const userId = session?.user?.id || ''

  const [mindMapData, setMindMapData] = useState<{ nodes: any[]; edges: any[] } | null>(null);
  const getMindMap = api.mindMap.getMindMap.useQuery(
    { userId: session?.user?.id },
    { enabled: !!session?.user?.id }
  );

  const priorityOptions = [
    { value: "1", label: "High", color: "text-red-500" },
    { value: "2", label: "Medium", color: "text-yellow-500" },
    { value: "3", label: "Low", color: "text-green-500" },
  ]

  useEffect(() => {
    checkMicrophonePermission();
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
    if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = true
      recognitionRef.current.interimResults = true

      recognitionRef.current.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result) => result.transcript)
          .join('')
        setTranscript(transcript)
      }
    }
  }, [])

  useEffect(() => {
    if (getMindMap.data) {
      setMindMapData(getMindMap.data);
    }
  }, [getMindMap.data]);

  useEffect(() => {
    if (getUserTodos.data) {
      setTasks(getUserTodos.data.map(todo => ({
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

                setProcessingStatus("Saving speech to text...")
                await saveSpeechToText.mutateAsync({ text: result.text })

                setProcessingStatus("Extracting and saving todos...")
                await extractAndSaveTodos.mutateAsync({ text: result.text })

                setProcessingStatus("Indexing your thoughts...")
                await upsertTranscript.mutateAsync({ text: result.text })

                // Refresh the todo list
                getUserTodos.refetch()

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
        getUserTodos.refetch(); // Refetch todos after adding a new task
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
      getUserTodos.refetch();
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

  const renderTask = (task: Task, level: number = 0, parentId: string | null = null) => (
    <li
      key={task.id}
      className={cn(
        `bg-white rounded-xl p-4 mb-2 shadow-sm`,
        `border-l-4`,
        task.priority === 1 ? "border-red-500" :
        task.priority === 2 ? "border-yellow-500" : "border-green-500",
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
          <Flag 
            className={cn(
              "w-4 h-4",
              task.priority === 1 ? "text-red-500" : 
              task.priority === 2 ? "text-yellow-500" : "text-green-500"
            )}
          />
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

  if (status === "loading") {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-100 p-8 flex items-center justify-center">
        <div className="w-full max-w-md bg-white bg-opacity-20 backdrop-filter backdrop-blur-lg rounded-3xl shadow-xl overflow-hidden p-8 text-center">
          <h1 className="text-3xl font-bold mb-6">Welcome to VoiceNotes</h1>
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
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-100 p-8 flex items-center justify-center">
      <div className="w-full max-w-4xl bg-white bg-opacity-20 backdrop-filter backdrop-blur-lg rounded-3xl shadow-xl overflow-hidden">
        <div className="p-4 flex justify-between items-center bg-white bg-opacity-50">
          <h1 className="text-xl font-bold">Welcome, {session?.user?.name}</h1>
          <Button onClick={() => signOut()} variant="ghost">
            <LogOut className="w-5 h-5 mr-2" />
            Sign Out
          </Button>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-white bg-opacity-50">
            <TabsTrigger value="voice" className="data-[state=active]:bg-white data-[state=active]:text-black">
              <Mic className="w-5 h-5 mr-2" />
              Voice Input
            </TabsTrigger>
            <TabsTrigger value="mindmap" className="data-[state=active]:bg-white data-[state=active]:text-black">
              <BrainCircuit className="w-5 h-5 mr-2" />
              Mindmap
            </TabsTrigger>
            <TabsTrigger value="todo" className="data-[state=active]:bg-white data-[state=active]:text-black">
              <CheckSquare className="w-5 h-5 mr-2" />
              Todo List
            </TabsTrigger>
            <TabsTrigger value="mindchat" className="data-[state=active]:bg-white data-[state=active]:text-black">
              <MessageSquare className="w-5 h-5 mr-2" />
              Mindchat
            </TabsTrigger>
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
            <div className="bg-white bg-opacity-50 rounded-xl p-4 h-150">
              {mindMapData ? (
                <MindMapModal nodes={mindMapData.nodes} edges={mindMapData.edges} />
              ) : (
                <div>Loading mind map...</div>
              )}
          </div>
          </TabsContent>
          <TabsContent value="todo" className="p-6">
            <div className="space-y-4">
              <div className="flex space-x-2">
                <Input
                  type="text"
                  placeholder="Add a new task"
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  className="flex-grow"
                />
                <RadioGroup
                  value={newTaskPriority.toString()}
                  onValueChange={(value) => setNewTaskPriority(parseInt(value))}
                  className="flex items-center space-x-2 bg-white p-1 rounded-md border border-gray-300"
                >
                  {priorityOptions.map((option) => (
                    <div key={option.value} className="flex items-center space-x-1">
                      <RadioGroupItem
                        value={option.value}
                        id={`priority-${option.value}`}
                        className="sr-only"
                      />
                      <Label
                        htmlFor={`priority-${option.value}`}
                        className={cn(
                          "flex items-center space-x-1 cursor-pointer rounded px-2 py-1",
                          newTaskPriority.toString() === option.value ? "bg-gray-100" : ""
                        )}
                      >
                        <Flag className={cn("w-4 h-4", option.color)} />
                        <span className="text-sm">{option.label}</span>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                <Button onClick={() => addTask()} disabled={isAddingTask}>
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
                <ul className="space-y-2 max-h-[calc(100vh-250px)] overflow-y-auto pr-4">
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
              <div className="flex space-x-2">
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
        </Tabs>
      </div>
    </div>
  )
}
