#/bin/sh
gcloud run deploy chatcompletionapi --source . --max-instances 1 --region us-west1
