import os

class Config:
    @property
    def PORT(self):
        return int(os.environ.get("PORT", 8000))
    
    @property
    def GEMINI_MODEL(self):
        return "gemini-2.0-flash"
    
    @property
    def ALLOWED_ORIGINS(self):
        return ["http://localhost:5000"]

config = Config()
