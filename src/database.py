import json
import os
import sys
from functools import lru_cache
from pathlib import Path

# Fix sqlite3 version issues in environment if required by ChromaDB
try:
    import pysqlite3
    sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')
except ImportError:
    pass

import chromadb
from chromadb.utils import embedding_functions
from src.config import CHROMA_DB_DIR, FACTS_FILE

class SportsVectorDB:
    def __init__(self):
        # Persistent storage directory
        self.client = chromadb.PersistentClient(path=str(CHROMA_DB_DIR))
        
        # Use default sentence-transformers model or default Chroma embedding function
        self.embed_fn = embedding_functions.DefaultEmbeddingFunction()
        
        # Create or retrieve collection
        self.collection = self.client.get_or_create_collection(
            name="sports_facts",
            embedding_function=self.embed_fn
        )
        
        # Automatically seed data if the collection is empty
        if self.collection.count() == 0:
            self.seed_database()

    def seed_database(self):
        """Loads facts from JSON and inserts them into ChromaDB."""
        if not FACTS_FILE.exists():
            print(f"[DB] Seed file not found at {FACTS_FILE}")
            return
            
        try:
            with open(FACTS_FILE, 'r', encoding='utf-8') as f:
                facts_data = json.load(f)
                
            documents = []
            metadatas = []
            ids = []
            
            for idx, item in enumerate(facts_data):
                sport = item.get("sport", "General")
                fact = item.get("fact", "")
                if fact:
                    documents.append(fact)
                    metadatas.append({"sport": sport.lower()})
                    ids.append(f"fact_{idx}")
                    
            if documents:
                self.collection.add(
                    documents=documents,
                    metadatas=metadatas,
                    ids=ids
                )
                print(f"[DB] Successfully seeded {len(documents)} facts into ChromaDB.")
        except Exception as e:
            print(f"[DB] Error seeding ChromaDB: {e}")

    def query_facts(self, sport: str, query_text: str, n_results: int = 2):
        """Queries the vector database using cosine similarity, filtered by sport."""
        try:
            results = self.collection.query(
                query_texts=[query_text],
                n_results=n_results,
                where={"sport": sport.lower()}
            )
            
            retrieved_facts = []
            if results and 'documents' in results and results['documents']:
                for doc in results['documents'][0]:
                    retrieved_facts.append({
                        "sport": sport,
                        "fact": doc
                    })
            return retrieved_facts
        except Exception as e:
            print(f"[DB] Error querying vector database: {e}")
            return []
            
_cached_sports_db = None


def get_sports_vector_db():
    global _cached_sports_db
    if _cached_sports_db is None:
        _cached_sports_db = SportsVectorDB()
    return _cached_sports_db


# Helper function
def get_historical_context(sport: str, query: str = "history cups rules tournaments champions", n_results: int = 2):
    db = get_sports_vector_db()
    return db.query_facts(sport, query, n_results)
