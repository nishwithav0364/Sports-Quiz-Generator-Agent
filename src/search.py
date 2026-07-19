from functools import lru_cache
from duckduckgo_search import DDGS


@lru_cache(maxsize=16)
def search_live_news(sport: str, query: str, max_results: int = 3):
    """Searches DuckDuckGo for recent news and info about a sport."""
    search_query = f"{sport} {query}"
    print(f"[SEARCH] Querying DuckDuckGo: '{search_query}'")
    
    results = []
    try:
        with DDGS() as ddgs:
            ddg_generator = ddgs.text(search_query, max_results=max_results)
            for r in ddg_generator:
                results.append({
                    "title": r.get("title", ""),
                    "uri": r.get("href", ""),
                    "body": r.get("body", "")
                })
    except Exception as e:
        print(f"[SEARCH] Error retrieving live search results: {e}")
        # Return elegant placeholders or fallback if rate-limited or offline
        results = [
            {
                "title": f"Recent {sport} News & Tournaments",
                "uri": "https://www.google.com/search?q=" + sport.replace(" ", "+"),
                "body": f"Latest tournament standings, match statistics, and key athletic achievements for {sport}."
            }
        ]
    return results
