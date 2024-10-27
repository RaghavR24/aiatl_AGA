# Use an official Python runtime as a parent image
FROM python:3.10-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Create a working directory
WORKDIR /app

# Install dependencies
COPY mindmapp_app/requirements.txt /app/
RUN pip install -r requirements.txt

# Copy the Django project
COPY mindmapp_app /app/

# Expose the port
EXPOSE 8080

# Set environment variables for Django
ENV DJANGO_SETTINGS_MODULE=mindmapp_app.settings

# Run the application
CMD ["gunicorn", "--bind", ":8080", "mindmapp_app.wsgi:application"]
