from django.urls import path
from .views import mind_map_view, UploadTextView, MindMapView
urlpatterns = [
    path('mindmap/', mind_map_view, name='mindmap'),
    path('upload-text/', UploadTextView.as_view(), name='upload-text'),
    path('get-mindmap/', MindMapView.as_view(), name='get-mindmap'),
    # path('upload-audio/', UploadAudioView.as_view(), name='upload-audio'),
]