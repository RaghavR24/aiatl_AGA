from django.db import models

class AudioFile(models.Model):
    title = models.CharField(max_length=255)
    file = models.FileField(upload_to='audio/')
    transcription = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
