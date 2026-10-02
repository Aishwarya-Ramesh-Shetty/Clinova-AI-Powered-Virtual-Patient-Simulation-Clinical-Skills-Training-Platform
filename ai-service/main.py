import getpass
import os
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import symptoms, prescription

app = FastAPI(title="Clinova AI Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(symptoms.router)
app.include_router(prescription.router)

if __name__ == '__main__':
    import google.generativeai as genai
    if not os.environ.get('GEMINI_API_KEY'):
        key = getpass.getpass('Enter your Gemini API Key: ')
        os.environ['GEMINI_API_KEY'] = key
    genai.configure(api_key=os.environ['GEMINI_API_KEY'])
    
    port = int(os.environ.get('PORT', 8000))
    uvicorn.run('main:app', host='0.0.0.0', port=port, reload=True)
