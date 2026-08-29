FROM python:3.11-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN pip install --no-cache-dir fastapi==0.115.0 uvicorn[standard]==0.30.6 \
    pydantic==2.9.2 pandas==2.2.3 numpy==2.1.1 scikit-learn==1.5.2
COPY main.py ./
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
