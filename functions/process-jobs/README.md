# Deploy Command

```bash
gcloud functions deploy process-jobs \
  --gen2 \
  --runtime=nodejs22 \
  --region=us-central1 \
  --source=. \
  --entry-point=handler \
  --trigger-http \
  --allow-unauthenticated \
  --env-vars-file .env.yaml \
  --timeout=900s \
  --memory=2048MB
```
