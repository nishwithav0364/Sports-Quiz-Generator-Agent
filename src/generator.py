import os
import json
import random
import requests
from src.config import GEMINI_API_KEY

def generate_sports_quiz(sport: str, difficulty: str, historical_facts: list, live_news: list):
    """Combines historical and live search context to generate a balanced sports quiz using Gemini."""
    
    # Format the retrieved historical facts
    hist_context = "\n".join([f"- {item['fact']}" for item in historical_facts]) if historical_facts else "No local database facts available."
    
    # Format the live search news
    live_context = "\n".join([f"- Title: {item['title']}\n  Snippet: {item['body']}" for item in live_news]) if live_news else "No recent search snippets available."
    
    prompt = f"""
You are an expert sports quiz creator. Your job is to write a highly engaging 4-question multiple-choice quiz about the sport "{sport}" at a "{difficulty}" difficulty level.

To ensure the quiz is factually grounded, informative, and fresh, you must blend two sources of context:
1. HISTORICAL CONTEXT (Local database): At least 1-2 questions should test these historical moments.
2. LIVE SEARCH CONTEXT (Recent news snippets): At least 1-2 questions should test these fresh developments.

=== HISTORICAL CONTEXT ===
{hist_context}

=== LIVE SEARCH CONTEXT ===
{live_context}

Strict Rules:
- Return exactly 4 questions.
- Use clear, concise, and accurate quiz language.
- For each question, specify the source of information: 'historical', 'live', or 'mixed'.
- Return the output strictly as a JSON object in the format below, with no markdown, no code fences, and valid JSON only:
{{
  "sport": "{sport}",
  "difficulty": "{difficulty}",
  "questions": [
    {{
      "id": "q1",
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "A",
      "explanation": "Detailed, highly informative explanation citing facts from the source.",
      "source": "historical"
    }}
  ]
}}
"""

    # If key is missing, trigger our robust local fallback generator immediately
    if not GEMINI_API_KEY:
        print("[GENERATOR] GEMINI_API_KEY is not configured. Using premium offline quiz fallback.")
        return get_local_fallback_quiz(sport, difficulty)

    if not historical_facts and not live_news:
        print("[GENERATOR] No grounding data available. Using fast local fallback.")
        return get_local_fallback_quiz(sport, difficulty)
        
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
        headers = {"Content-Type": "application/json"}
        payload = {
            "contents": [{
                "parts": [{"text": prompt}]
            }],
            "generationConfig": {
                "responseMimeType": "application/json"
            }
        }
        
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        
        if response.status_code == 200:
            res_data = response.json()
            raw_text = res_data["candidates"][0]["content"]["parts"][0]["text"]
            # Parse the JSON response
            quiz_data = json.loads(raw_text.strip())
            return quiz_data, False
        else:
            print(f"[GENERATOR] Gemini API returned error code {response.status_code}: {response.text}")
            return get_local_fallback_quiz(sport, difficulty)
            
    except Exception as e:
        print(f"[GENERATOR] Error generating quiz via Gemini: {e}")
        return get_local_fallback_quiz(sport, difficulty)

def get_local_fallback_quiz(sport: str, difficulty: str):
    """Fallback generator with curated sports quizzes for offline resilience."""
    sport_key = sport.title()

    templates = {
        "Cricket": {
            "Easy": [
                {
                    "id": "q1",
                    "question": "In cricket, how many players are on the field for one side during an official match?",
                    "options": ["9", "10", "11", "12"],
                    "correctAnswer": "C",
                    "explanation": "A standard cricket team fields 11 players on the field during play.",
                    "source": "historical"
                },
                {
                    "id": "q2",
                    "question": "What score does a batsman get when the ball crosses the boundary after bouncing?",
                    "options": ["2 runs", "4 runs", "6 runs", "1 run"],
                    "correctAnswer": "B",
                    "explanation": "When the ball crosses the boundary after bouncing, the batting team scores 4 runs.",
                    "source": "historical"
                },
                {
                    "id": "q3",
                    "question": "Which format of cricket is usually completed in one day?",
                    "options": ["Test cricket", "Twenty20", "One Day International", "The Hundred"],
                    "correctAnswer": "C",
                    "explanation": "A One Day International (ODI) match is designed to finish in one day.",
                    "source": "historical"
                },
                {
                    "id": "q4",
                    "question": "Which country famously won the 1983 Cricket World Cup under Kapil Dev?",
                    "options": ["Australia", "India", "West Indies", "England"],
                    "correctAnswer": "B",
                    "explanation": "India won the 1983 Cricket World Cup, defeating the West Indies in the final.",
                    "source": "historical"
                }
            ]
        },
        "Football": {
            "Easy": [
                {
                    "id": "q1",
                    "question": "How long is a standard football match without stoppage time?",
                    "options": ["80 minutes", "90 minutes", "100 minutes", "70 minutes"],
                    "correctAnswer": "B",
                    "explanation": "A standard professional football match lasts 90 minutes, divided into two 45-minute halves.",
                    "source": "historical"
                },
                {
                    "id": "q2",
                    "question": "Which country hosted the first FIFA World Cup in 1930?",
                    "options": ["Argentina", "Italy", "Uruguay", "Brazil"],
                    "correctAnswer": "C",
                    "explanation": "Uruguay hosted and won the first FIFA World Cup in 1930.",
                    "source": "historical"
                },
                {
                    "id": "q3",
                    "question": "How many players does each football team have on the pitch during play?",
                    "options": ["10", "11", "12", "9"],
                    "correctAnswer": "B",
                    "explanation": "Each football team fields 11 players on the pitch during a standard game.",
                    "source": "historical"
                },
                {
                    "id": "q4",
                    "question": "Which action is not allowed for outfield football players?",
                    "options": ["Heading", "Chest trapping", "Using hands or arms", "Foot passing"],
                    "correctAnswer": "C",
                    "explanation": "Outfield players are not allowed to use their hands or arms to touch the ball during normal play.",
                    "source": "historical"
                }
            ]
        },
        "Tennis": {
            "Easy": [
                {
                    "id": "q1",
                    "question": "How many points does a player need to win a game after deuce if they win the next point?",
                    "options": ["Game point", "Advantage", "Match point", "Break point"],
                    "correctAnswer": "B",
                    "explanation": "After deuce, winning the next point gives the player Advantage in tennis.",
                    "source": "historical"
                },
                {
                    "id": "q2",
                    "question": "How many sets does a player usually need to win in a men's Grand Slam tennis match?",
                    "options": ["2", "3", "4", "5"],
                    "correctAnswer": "D",
                    "explanation": "In men's Grand Slam singles, the winner must win 5 sets.",
                    "source": "historical"
                },
                {
                    "id": "q3",
                    "question": "What color is the tennis ball used in most professional tournaments?",
                    "options": ["White", "Yellow", "Orange", "Green"],
                    "correctAnswer": "B",
                    "explanation": "Professional tennis tournaments commonly use yellow balls for visibility.",
                    "source": "historical"
                },
                {
                    "id": "q4",
                    "question": "Which player is famously known as 'The King of Clay'?",
                    "options": ["Roger Federer", "Rafael Nadal", "Novak Djokovic", "Andy Murray"],
                    "correctAnswer": "B",
                    "explanation": "Rafael Nadal is known as 'The King of Clay' for his dominance on clay courts.",
                    "source": "historical"
                }
            ]
        },
        "Basketball": {
            "Easy": [
                {
                    "id": "q1",
                    "question": "How many players from each team are on the court in basketball?",
                    "options": ["4", "5", "6", "7"],
                    "correctAnswer": "B",
                    "explanation": "Five players from each team are on the court in a standard basketball game.",
                    "source": "historical"
                },
                {
                    "id": "q2",
                    "question": "What is it called when a player scores from beyond the three-point line?",
                    "options": ["Layup", "Two-pointer", "Three-pointer", "Free throw"],
                    "correctAnswer": "C",
                    "explanation": "A shot made from beyond the three-point line scores three points.",
                    "source": "historical"
                },
                {
                    "id": "q3",
                    "question": "How many free throws are awarded for a shooting foul on a made basket?",
                    "options": ["1", "2", "3", "0"],
                    "correctAnswer": "A",
                    "explanation": "A made basket with a shooting foul results in one free throw, known as an 'and-one'.",
                    "source": "historical"
                },
                {
                    "id": "q4",
                    "question": "Which league is the top professional basketball league in the USA?",
                    "options": ["NFL", "MLB", "NBA", "NHL"],
                    "correctAnswer": "C",
                    "explanation": "The NBA is the premier professional basketball league in the United States.",
                    "source": "historical"
                }
            ]
        },
        "Badminton": {
            "Easy": [
                {
                    "id": "q1",
                    "question": "How many points are needed to win a standard badminton game?",
                    "options": ["15", "21", "25", "11"],
                    "correctAnswer": "B",
                    "explanation": "A standard badminton game is played to 21 points.",
                    "source": "historical"
                },
                {
                    "id": "q2",
                    "question": "Which object is struck back and forth in badminton?",
                    "options": ["Ball", "Shuttlecock", "Frisbee", "Disc"],
                    "correctAnswer": "B",
                    "explanation": "Badminton players hit a shuttlecock over the net.",
                    "source": "historical"
                },
                {
                    "id": "q3",
                    "question": "In badminton, how many players are on court for a doubles match?",
                    "options": ["2", "3", "4", "6"],
                    "correctAnswer": "C",
                    "explanation": "Doubles badminton is played with four players, two per side.",
                    "source": "historical"
                },
                {
                    "id": "q4",
                    "question": "Which side of the court must the shuttlecock land for the rally to continue?",
                    "options": ["Any part of court", "Only backcourt", "Only service court", "Only net area"],
                    "correctAnswer": "A",
                    "explanation": "The shuttlecock must land anywhere inside the opponent's court boundaries for the rally to continue.",
                    "source": "historical"
                }
            ]
        },
        "Athletics": {
            "Easy": [
                {
                    "id": "q1",
                    "question": "How many meters are in a standard outdoor running track lap?",
                    "options": ["200m", "400m", "800m", "1000m"],
                    "correctAnswer": "B",
                    "explanation": "A standard outdoor athletics track lap is 400 meters long.",
                    "source": "historical"
                },
                {
                    "id": "q2",
                    "question": "Which event measures the greatest horizontal jump in athletics?",
                    "options": ["Long jump", "High jump", "Triple jump", "Pole vault"],
                    "correctAnswer": "A",
                    "explanation": "The long jump measures the greatest horizontal distance jumped.",
                    "source": "historical"
                },
                {
                    "id": "q3",
                    "question": "What is the standard distance of a sprint race in the Olympics?",
                    "options": ["100m", "400m", "1500m", "5000m"],
                    "correctAnswer": "A",
                    "explanation": "The 100-meter dash is the most famous Olympic sprint event.",
                    "source": "historical"
                },
                {
                    "id": "q4",
                    "question": "Which athletics event involves tossing a heavy metal ball?",
                    "options": ["Discus throw", "Shot put", "Javelin throw", "Hammer throw"],
                    "correctAnswer": "B",
                    "explanation": "Shot put involves throwing a heavy metal ball as far as possible.",
                    "source": "historical"
                }
            ]
        },
        "Formula 1": {
            "Easy": [
                {
                    "id": "q1",
                    "question": "What does 'F1' stand for in motorsport?",
                    "options": ["Formula One", "Formula First", "Fast One", "Fuel One"],
                    "correctAnswer": "A",
                    "explanation": "F1 stands for Formula One, the highest class of international single-seater auto racing.",
                    "source": "historical"
                },
                {
                    "id": "q2",
                    "question": "Which component of an F1 car generates downforce?",
                    "options": ["Engine", "Suspension", "Aerodynamic wings", "Tires"],
                    "correctAnswer": "C",
                    "explanation": "Aerodynamic wings on an F1 car generate downforce to improve grip.",
                    "source": "historical"
                },
                {
                    "id": "q3",
                    "question": "How many wheels does an F1 car have?",
                    "options": ["3", "4", "5", "6"],
                    "correctAnswer": "B",
                    "explanation": "An F1 car uses four wheels, one at each corner.",
                    "source": "historical"
                },
                {
                    "id": "q4",
                    "question": "Which figure is awarded to the fastest driver in qualifying?",
                    "options": ["Pole position", "Checkered flag", "Fastest lap", "Safety car"],
                    "correctAnswer": "A",
                    "explanation": "Pole position is earned by the driver with the fastest qualifying time.",
                    "source": "historical"
                }
            ]
        },
        "Swimming": {
            "Easy": [
                {
                    "id": "q1",
                    "question": "Which stroke is used in the fastest competitive swimming event?",
                    "options": ["Backstroke", "Breaststroke", "Butterfly", "Freestyle"],
                    "correctAnswer": "D",
                    "explanation": "Freestyle is typically the fastest stroke in competitive swimming.",
                    "source": "historical"
                },
                {
                    "id": "q2",
                    "question": "How many lengths of a 50m pool are required for a 200m race?",
                    "options": ["2", "4", "6", "8"],
                    "correctAnswer": "B",
                    "explanation": "A 200m race in a 50m pool requires four lengths.",
                    "source": "historical"
                },
                {
                    "id": "q3",
                    "question": "Which swimming stroke is performed on the back?",
                    "options": ["Backstroke", "Butterfly", "Breaststroke", "Freestyle"],
                    "correctAnswer": "A",
                    "explanation": "Backstroke is the only competitive stroke swum on the back.",
                    "source": "historical"
                },
                {
                    "id": "q4",
                    "question": "What color cap do swimmers often wear in competition?",
                    "options": ["Red", "Black", "Any team color", "White"],
                    "correctAnswer": "C",
                    "explanation": "Swimmers wear caps in any team or national colors as allowed by competition rules.",
                    "source": "historical"
                }
            ]
        }
    }

    quiz_list = templates.get(sport_key, {}).get(difficulty)
    if not quiz_list:
        quiz_list = templates.get(sport_key, {}).get("Easy", [])
    if not quiz_list:
        quiz_list = [
            {
                "id": "q1",
                "question": f"What is a common competitive fact about {sport_key}?",
                "options": ["Fact A", "Fact B", "Fact C", "Fact D"],
                "correctAnswer": "A",
                "explanation": f"This is a reliable general fact about {sport_key}.",
                "source": "historical"
            }
        ]

    selected_questions = random.sample(quiz_list, min(4, len(quiz_list)))
    shuffled_questions = shuffle_quiz_options(selected_questions)
    quiz_data = {
        "sport": sport,
        "difficulty": difficulty,
        "questions": shuffled_questions
    }
    return quiz_data, True


def shuffle_quiz_options(questions: list):
    shuffled_questions = []
    for q in questions:
        options = list(q["options"])
        correct_index = ord(q["correctAnswer"]) - 65
        correct_text = options[correct_index]
        random.shuffle(options)
        new_correct = chr(65 + options.index(correct_text))

        new_q = dict(q)
        new_q["options"] = options
        new_q["correctAnswer"] = new_correct
        shuffled_questions.append(new_q)
    return shuffled_questions
