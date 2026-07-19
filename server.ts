import express from "express";
import path from "path";
import fs from "fs/promises";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy-loaded Gemini Client
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY is not defined in the environment secrets. Please set it via the Secrets panel in AI Studio.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// Interfaces
interface Fact {
  sport: string;
  fact: string;
  vector?: number[];
}

let cachedFacts: Fact[] = [];

// Cosine Similarity calculation for Vector Search
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Fallback Keyword score computation
function getKeywordScore(text: string, query: string): number {
  const textWords = text.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  const queryWords = query.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  let matchCount = 0;
  for (const qw of queryWords) {
    if (textWords.includes(qw)) {
      matchCount++;
    }
  }
  return matchCount;
}

// Lazy Database loader
async function getFactsWithVectors(): Promise<Fact[]> {
  if (cachedFacts.length > 0) {
    return cachedFacts;
  }

  try {
    const filePath = path.join(process.cwd(), "data", "sports_facts.json");
    const rawData = await fs.readFile(filePath, "utf-8");
    cachedFacts = JSON.parse(rawData);
    console.log(`Vector DB: Successfully loaded ${cachedFacts.length} offline database facts.`);
    return cachedFacts;
  } catch (err) {
    console.error("Vector DB Initialization Error:", err);
    return [];
  }
}

// Query Vector database with metadata filtering and keyword fallback
async function queryHistoricFacts(sport: string, queryText: string, nResults = 2): Promise<Fact[]> {
  try {
    const facts = await getFactsWithVectors();
    
    // Perform metadata filtering by sport (case-insensitive)
    const sportFacts = facts.filter(f => f.sport.toLowerCase() === sport.toLowerCase());
    if (sportFacts.length === 0) {
      console.log(`Vector DB: No local facts found for sport: "${sport}"`);
      return [];
    }

    // Try generating embeddings, with keyword score fallback if rate limited or key is missing
    let queryVector: number[] | null = null;
    try {
      const ai = getAI();
      
      // Lazily embed sport facts if not already embedded
      for (const fact of sportFacts) {
        if (!fact.vector) {
          const res = (await ai.models.embedContent({
            model: "text-embedding-004",
            contents: fact.fact,
          })) as any;
          fact.vector = res.embedding?.values || res.embeddings?.[0]?.values;
        }
      }

      // Embed the query
      const queryRes = (await ai.models.embedContent({
        model: "text-embedding-004",
        contents: queryText,
      })) as any;
      queryVector = queryRes.embedding?.values || queryRes.embeddings?.[0]?.values || null;
    } catch (embErr) {
      console.warn("Vector DB: Gemini Embeddings rate-limited or key missing. Falling back to Keyword Matching.");
    }

    if (queryVector) {
      const scoredFacts = sportFacts.map(fact => {
        const similarity = fact.vector ? cosineSimilarity(queryVector!, fact.vector) : 0;
        return { fact, score: similarity };
      });
      scoredFacts.sort((a, b) => b.score - a.score);
      console.log(`Vector DB: Retrieved ${scoredFacts.slice(0, nResults).length} facts using Vector Cosine Similarity.`);
      return scoredFacts.slice(0, nResults).map(sf => sf.fact);
    } else {
      const scoredFacts = sportFacts.map(fact => {
        const score = getKeywordScore(fact.fact, queryText);
        return { fact, score };
      });
      scoredFacts.sort((a, b) => b.score - a.score);
      console.log(`Vector DB: Retrieved ${scoredFacts.slice(0, nResults).length} facts using Keyword Overlap score.`);
      return scoredFacts.slice(0, nResults).map(sf => sf.fact);
    }
  } catch (err) {
    console.error("Vector DB Query Error:", err);
    return [];
  }
}

// PREMIUM PRE-DEFINED FALLBACK QUIZZES FOR CRITICAL SYSTEM RESILIENCE (e.g. 429 Quota Exhaustion)
const FALLBACK_QUIZZES: Record<string, Record<string, any[]>> = {
  "Cricket": {
    "Easy": [
      {
        id: "cf_e1",
        question: "How many runs are awarded when a batsman hits the ball over the boundary line without it bouncing?",
        options: ["4 runs", "6 runs", "1 run", "No runs"],
        correctAnswer: "B",
        explanation: "Hitting the ball over the boundary line without it bouncing awards exactly 6 runs. If it bounces first, it awards 4 runs.",
        source: "historical"
      },
      {
        id: "cf_e2",
        question: "Which nation won the historic 1983 Cricket World Cup under the captaincy of Kapil Dev?",
        options: ["West Indies", "Australia", "India", "England"],
        correctAnswer: "C",
        explanation: "India defeated the highly favored West Indies in the 1983 final at Lord's to win their first-ever World Cup title under Kapil Dev.",
        source: "historical"
      },
      {
        id: "cf_e3",
        question: "How many players are on the field for one team during an active cricket match?",
        options: ["9 players", "11 players", "15 players", "7 players"],
        correctAnswer: "B",
        explanation: "A standard cricket team consists of 11 active players on the field.",
        source: "historical"
      },
      {
        id: "cf_e4",
        question: "Which format of cricket is considered the oldest and most traditional, lasting up to 5 days?",
        options: ["T20 Cricket", "One Day International (ODI)", "Test Cricket", "The Hundred"],
        correctAnswer: "C",
        explanation: "Test cricket is the oldest format, first officially played in 1877, and matches can last up to 5 days.",
        source: "historical"
      }
    ],
    "Medium": [
      {
        id: "cf_m1",
        question: "In 1877, the first official cricket Test match was played between which two countries?",
        options: ["Australia and England", "India and Pakistan", "England and South Africa", "West Indies and England"],
        correctAnswer: "A",
        explanation: "The first official Test match took place in 1877 at the Melbourne Cricket Ground between Australia and England.",
        source: "historical"
      },
      {
        id: "cf_m2",
        question: "Sir Donald Bradman needed how many runs in his final Test innings to finish with a batting average of exactly 100?",
        options: ["4 runs", "10 runs", "100 runs", "0 runs"],
        correctAnswer: "A",
        explanation: "Sir Donald Bradman needed just 4 runs in his final innings in 1948 but was bowled for a duck, leaving his average at 99.94.",
        source: "historical"
      },
      {
        id: "cf_m3",
        question: "Which iconic cricket stadium is traditionally referred to as the 'Home of Cricket'?",
        options: ["Melbourne Cricket Ground (MCG)", "Lord's Cricket Ground in London", "Eden Gardens in Kolkata", "Sydney Cricket Ground (SCG)"],
        correctAnswer: "B",
        explanation: "Lord's Cricket Ground in London is widely celebrated as the legendary 'Home of Cricket'.",
        source: "historical"
      },
      {
        id: "cf_m4",
        question: "Who was the captain of the Australian squad during their legendary 2003 and 2007 ICC World Cup wins?",
        options: ["Steve Waugh", "Ricky Ponting", "Michael Clarke", "Shane Warne"],
        correctAnswer: "B",
        explanation: "Ricky Ponting captained the Australian team to back-to-back undefeated World Cup titles in 2003 and 2007.",
        source: "live"
      }
    ],
    "Hard": [
      {
        id: "cf_h1",
        question: "What is the exact Test cricket batting average of Australian legend Sir Donald Bradman?",
        options: ["99.94", "98.50", "100.00", "99.04"],
        correctAnswer: "A",
        explanation: "Bradman finished his iconic career with a Test batting average of 99.94, a record that remains completely unmatched.",
        source: "historical"
      },
      {
        id: "cf_h2",
        question: "Who holds the record for taking the most wickets in Test cricket history?",
        options: ["Shane Warne", "Muttiah Muralitharan", "Anil Kumble", "James Anderson"],
        correctAnswer: "B",
        explanation: "Sri Lankan spin bowler Muttiah Muralitharan holds the record with a staggering 800 wickets in Test matches.",
        source: "live"
      },
      {
        id: "cf_h3",
        question: "Who was the first batsman in cricket history to score a double century (200 runs) in a One Day International (ODI) match?",
        options: ["Rohit Sharma", "Sachin Tendulkar", "Virender Sehwag", "Chris Gayle"],
        correctAnswer: "B",
        explanation: "Sachin Tendulkar of India made history in 2010 by scoring 200 not out against South Africa in Gwalior.",
        source: "live"
      },
      {
        id: "cf_h4",
        question: "In cricket, what is the precise standard length of the pitch between the wickets?",
        options: ["20 yards", "22 yards", "24 yards", "18 yards"],
        correctAnswer: "B",
        explanation: "The standard cricket pitch length is exactly 22 yards (20.12 meters) from stumps to stumps.",
        source: "historical"
      }
    ]
  },
  "Football": {
    "Easy": [
      {
        id: "ff_e1",
        question: "How long is a standard professional football (soccer) match, excluding extra time?",
        options: ["80 minutes", "90 minutes", "100 minutes", "60 minutes"],
        correctAnswer: "B",
        explanation: "A standard professional association football match consists of two halves of 45 minutes each, totaling 90 minutes.",
        source: "historical"
      },
      {
        id: "ff_e2",
        question: "Which country hosted the first-ever FIFA World Cup in 1930?",
        options: ["Argentina", "Uruguay", "Brazil", "Italy"],
        correctAnswer: "B",
        explanation: "Uruguay hosted the inaugural FIFA World Cup in 1930 and also won the championship.",
        source: "historical"
      },
      {
        id: "ff_e3",
        question: "How many players from each team are allowed on the pitch during a standard football match?",
        options: ["9 players", "11 players", "12 players", "10 players"],
        correctAnswer: "B",
        explanation: "Each team fields exactly 11 players, including one goalkeeper.",
        source: "historical"
      },
      {
        id: "ff_e4",
        question: "Which of these body parts is a regular player (not goalkeeper) forbidden to use to touch the ball during play?",
        options: ["Head", "Chest", "Hands and Arms", "Feet"],
        correctAnswer: "C",
        explanation: "Outfield players are strictly forbidden to touch the ball with their hands or arms during active gameplay.",
        source: "historical"
      }
    ],
    "Medium": [
      {
        id: "ff_m1",
        question: "Who won the first FIFA World Cup in 1930 by defeating Argentina 4-2 in the final?",
        options: ["Brazil", "Uruguay", "Germany", "France"],
        correctAnswer: "B",
        explanation: "The inaugural 1930 World Cup was won by the host country Uruguay, who beat Argentina 4-2 in the final match in Montevideo.",
        source: "historical"
      },
      {
        id: "ff_m2",
        question: "What are the standard goal dimensions in a professional association football match?",
        options: ["7.32m wide and 2.44m high", "8.00m wide and 2.00m high", "6.50m wide and 2.50m high", "7.00m wide and 2.20m high"],
        correctAnswer: "A",
        explanation: "The goals must be exactly 7.32 meters (8 yards) wide and 2.44 meters (8 feet) high according to IFAB standards.",
        source: "historical"
      },
      {
        id: "ff_m3",
        question: "Which nation has won the most FIFA World Cup tournaments in history?",
        options: ["Germany", "Italy", "Brazil", "Argentina"],
        correctAnswer: "C",
        explanation: "Brazil has won the FIFA World Cup a record 5 times (1958, 1962, 1970, 1994, 2002).",
        source: "live"
      },
      {
        id: "ff_m4",
        question: "Which legendary player holds the record for winning the most Ballon d'Or awards in football history?",
        options: ["Cristiano Ronaldo", "Lionel Messi", "Pelé", "Diego Maradona"],
        correctAnswer: "B",
        explanation: "Lionel Messi holds the record with 8 Ballon d'Or awards, solidifying his historic status.",
        source: "live"
      }
    ],
    "Hard": [
      {
        id: "ff_h1",
        question: "Pelé of Brazil is the only player to have won three FIFA World Cups. In which years did he win them?",
        options: ["1958, 1962, and 1970", "1954, 1958, and 1966", "1962, 1966, and 1974", "1950, 1958, and 1962"],
        correctAnswer: "A",
        explanation: "Pelé achieved historic World Cup victories as an active player in 1958 (Sweden), 1962 (Chile), and 1970 (Mexico).",
        source: "historical"
      },
      {
        id: "ff_h2",
        question: "What is the standard pitch length required for international matches?",
        options: ["90 to 100 meters", "100 to 110 meters", "110 to 120 meters", "95 to 105 meters"],
        correctAnswer: "B",
        explanation: "FIFA standards state that international pitch lengths must be between 100 and 110 meters.",
        source: "historical"
      },
      {
        id: "ff_h3",
        question: "Which prestigious club won the first-ever European Cup (now UEFA Champions League) in 1956?",
        options: ["Real Madrid", "AC Milan", "Manchester United", "Barcelona"],
        correctAnswer: "A",
        explanation: "Real Madrid won the inaugural title in 1956 and proceeded to win the first five editions of the tournament.",
        source: "live"
      },
      {
        id: "ff_h4",
        question: "Who is the all-time leading goal scorer in the UEFA Champions League?",
        options: ["Lionel Messi", "Cristiano Ronaldo", "Robert Lewandowski", "Karim Benzema"],
        correctAnswer: "B",
        explanation: "Cristiano Ronaldo is the all-time top scorer in Champions League history with over 140 goals.",
        source: "live"
      }
    ]
  },
  "Badminton": {
    "Easy": [
      {
        id: "bf_e1",
        question: "What lightweight feathered object is hit back and forth in a game of badminton?",
        options: ["Shuttlecock", "Pluck", "Feather ball", "Spinner"],
        correctAnswer: "A",
        explanation: "Badminton uses a feathered or synthetic shuttlecock (or birdie) instead of a standard spherical ball.",
        source: "historical"
      },
      {
        id: "bf_e2",
        question: "Under standard rules, how many points must a player score to win a normal game of badminton?",
        options: ["11 points", "15 points", "21 points", "25 points"],
        correctAnswer: "C",
        explanation: "A standard game is won by the first side to reach 21 points, with a margin of 2 points.",
        source: "historical"
      },
      {
        id: "bf_e3",
        question: "How many players compete on the court during a standard doubles badminton match?",
        options: ["2 players", "4 players", "6 players", "8 players"],
        correctAnswer: "B",
        explanation: "A doubles match features 2 players on each side, making a total of 4 active competitors.",
        source: "historical"
      },
      {
        id: "bf_e4",
        question: "Which premier tournament is considered the men's international world team championship?",
        options: ["Uber Cup", "Thomas Cup", "Sudirman Cup", "Davis Cup"],
        correctAnswer: "B",
        explanation: "The Thomas Cup, founded in 1948, serves as the premier men's team championship in badminton.",
        source: "historical"
      }
    ],
    "Medium": [
      {
        id: "bf_m1",
        question: "India achieved a historic first Thomas Cup title in 2022 by defeating which traditional badminton powerhouse?",
        options: ["China", "Indonesia", "Denmark", "Japan"],
        correctAnswer: "B",
        explanation: "India made sports history in 2022 by defeating 14-time champions Indonesia 3-0 in Bangkok to win the Thomas Cup.",
        source: "historical"
      },
      {
        id: "bf_m2",
        question: "When did badminton make its official Olympic debut as a full medal sport?",
        options: ["Barcelona 1992", "Seoul 1988", "Atlanta 1996", "Munich 1972"],
        correctAnswer: "A",
        explanation: "Badminton was introduced as a full medal sport at the 1992 Summer Olympics in Barcelona, Spain.",
        source: "historical"
      },
      {
        id: "bf_m3",
        question: "Which tournament represents the premier international team championship for women's badminton?",
        options: ["Uber Cup", "Thomas Cup", "Sudirman Cup", "Fed Cup"],
        correctAnswer: "A",
        explanation: "The Uber Cup, first held in 1956, serves as the premier global women's team badminton championship.",
        source: "historical"
      },
      {
        id: "bf_m4",
        question: "What is the standard height of the net at the center of a professional badminton court?",
        options: ["1.524 meters", "1.600 meters", "1.400 meters", "1.550 meters"],
        correctAnswer: "A",
        explanation: "The net height at the center of the court must be exactly 1.524 meters (5 feet) according to international standards.",
        source: "historical"
      }
    ],
    "Hard": [
      {
        id: "bf_h1",
        question: "In which year was the premier international men's team badminton championship, the Thomas Cup, established?",
        options: ["1938", "1948", "1956", "1960"],
        correctAnswer: "B",
        explanation: "The first Thomas Cup was planned for 1941 but got delayed due to World War II, officially launching in 1948.",
        source: "historical"
      },
      {
        id: "bf_h2",
        question: "During the 1992 Barcelona Olympics debut, which nation dominated by winning both singles gold medals?",
        options: ["China", "Indonesia", "South Korea", "Malaysia"],
        correctAnswer: "B",
        explanation: "Indonesia dominated the debut by claiming both singles titles: Alan Budikusuma won the men's, and Susi Susanti won the women's gold.",
        source: "historical"
      },
      {
        id: "bf_h3",
        question: "Which country has won the Uber Cup the most times, holding over 15 championship titles?",
        options: ["Indonesia", "Japan", "China", "South Korea"],
        correctAnswer: "C",
        explanation: "China has won the Uber Cup more than any other nation, dominating women's team badminton since their debut in 1984.",
        source: "live"
      },
      {
        id: "bf_h4",
        question: "What is the standard number of feathers required on an official, regulation feather shuttlecock?",
        options: ["12 feathers", "14 feathers", "16 feathers", "18 feathers"],
        correctAnswer: "C",
        explanation: "A regulation feathered shuttlecock must consist of exactly 16 feathers fixed in a cork base.",
        source: "historical"
      }
    ]
  },
  "Tennis": {
    "Easy": [
      {
        id: "tf_e1",
        question: "Which of the four Grand Slams is played on traditional grass courts and features a strict all-white dress code?",
        options: ["Australian Open", "French Open", "Wimbledon", "US Open"],
        correctAnswer: "C",
        explanation: "Wimbledon, founded in 1877, is the oldest tennis tournament and is famously played on grass with a white-clothing mandate.",
        source: "historical"
      },
      {
        id: "tf_e2",
        question: "What is the term used in tennis to describe a score tie at 40-40?",
        options: ["Advantage", "Deuce", "Break", "Matchpoint"],
        correctAnswer: "B",
        explanation: "A tie at 40-40 in a tennis game is called 'Deuce'. A player must then score two consecutive points to win.",
        source: "historical"
      },
      {
        id: "tf_e3",
        question: "What is the traditional scoring term for a score of zero points in tennis?",
        options: ["Love", "Null", "Blank", "Zero"],
        correctAnswer: "A",
        explanation: "Zero is referred to as 'Love' in tennis, historically believed to originate from the French word for egg ('l'oeuf'), symbolizing zero.",
        source: "historical"
      },
      {
        id: "tf_e4",
        question: "On which unique playing surface is the French Open Grand Slam played?",
        options: ["Grass", "Red Clay", "Hard court", "Carpet"],
        correctAnswer: "B",
        explanation: "The French Open (Roland Garros) is uniquely played on slow red clay courts.",
        source: "historical"
      }
    ],
    "Medium": [
      {
        id: "tf_m1",
        question: "In which year was the historic Wimbledon Championship founded?",
        options: ["1877", "1891", "1905", "1920"],
        correctAnswer: "A",
        explanation: "The inaugural tournament at Wimbledon began in 1877, organized by the All England Croquet and Lawn Tennis Club.",
        source: "historical"
      },
      {
        id: "tf_m2",
        question: "At the 2010 Wimbledon tournament, John Isner and Nicolas Mahut played the longest tennis match in history. For how long did it last?",
        options: ["5 hours 15 mins", "8 hours 30 mins", "11 hours 5 mins", "14 hours"],
        correctAnswer: "C",
        explanation: "The legendary match lasted 11 hours and 5 minutes over three separate days of play.",
        source: "historical"
      },
      {
        id: "tf_m3",
        question: "What was the final score of the historic fifth set in the 2010 Isner-Mahut Wimbledon marathon?",
        options: ["20-18", "35-33", "70-68", "50-48"],
        correctAnswer: "C",
        explanation: "American John Isner won the final set with an unbelievable scoreline of 70-68.",
        source: "historical"
      },
      {
        id: "tf_m4",
        question: "Which male tennis player has won a record 14 singles titles at the French Open?",
        options: ["Roger Federer", "Rafael Nadal", "Novak Djokovic", "Pete Sampras"],
        correctAnswer: "B",
        explanation: "Rafael Nadal is famously dubbed the 'King of Clay' for winning 14 French Open titles.",
        source: "live"
      }
    ],
    "Hard": [
      {
        id: "tf_h1",
        question: "Who is the only tennis player to achieve the 'Golden Slam' in a single calendar year (1988) by winning all 4 Grand Slams and Olympic Gold?",
        options: ["Martina Navratilova", "Steffi Graf", "Serena Williams", "Chris Evert"],
        correctAnswer: "B",
        explanation: "German icon Steffi Graf completed the only Golden Slam in tennis history in 1988.",
        source: "historical"
      },
      {
        id: "tf_h2",
        question: "Which of the four Grand Slams is traditionally played on blue Plexicushion hard courts?",
        options: ["US Open", "Australian Open", "French Open", "Wimbledon"],
        correctAnswer: "B",
        explanation: "The Australian Open has been played on blue hard courts (Plexicushion and later GreenSet) at Melbourne Park.",
        source: "live"
      },
      {
        id: "tf_h3",
        question: "Who was the first male player in the Open Era to win 20 Grand Slam singles titles?",
        options: ["Roger Federer", "Rafael Nadal", "Pete Sampras", "Björn Borg"],
        correctAnswer: "A",
        explanation: "Roger Federer of Switzerland became the first male player to reach the historic 20 Grand Slam milestone in 2018.",
        source: "live"
      },
      {
        id: "tf_h4",
        question: "What is the precise required height of a professional tennis net at its center?",
        options: ["3 feet (0.914 meters)", "3.5 feet (1.07 meters)", "2.5 feet (0.76 meters)", "4 feet (1.22 meters)"],
        correctAnswer: "A",
        explanation: "According to ITF rules, the tennis net must be exactly 3 feet (0.914 meters) high at the center.",
        source: "historical"
      }
    ]
  },
  "Basketball": {
    "Easy": [
      {
        id: "bk_e1",
        question: "How many points is a successful free throw worth in standard basketball rules?",
        options: ["1 point", "2 points", "3 points", "1.5 points"],
        correctAnswer: "A",
        explanation: "Free throws are uncontested shots awarded after fouls and are worth exactly 1 point each.",
        source: "historical"
      },
      {
        id: "bk_e2",
        question: "What items did inventor Dr. James Naismith use as the first basketball hoops in 1891?",
        options: ["Peach baskets", "Metal buckets", "Wooden boxes", "Plastic crates"],
        correctAnswer: "A",
        explanation: "Dr. Naismith hung two peach baskets on the balcony railings of the YMCA gym, requiring the ball to be manually retrieved.",
        source: "historical"
      },
      {
        id: "bk_e3",
        question: "What is the official regulation height of an NBA basketball hoop from the floor?",
        options: ["8 feet", "9 feet", "10 feet", "12 feet"],
        correctAnswer: "C",
        explanation: "A standard regulation basketball rim is positioned exactly 10 feet (3.05 meters) above the court floor.",
        source: "historical"
      },
      {
        id: "bk_e4",
        question: "What kind of ball did Dr. Naismith originally use when inventing basketball in 1891?",
        options: ["Basketball", "Soccer ball", "Rugby ball", "Medicine ball"],
        correctAnswer: "B",
        explanation: "The first game of basketball was played using a soccer ball before dedicated basketballs were manufactured.",
        source: "historical"
      }
    ],
    "Medium": [
      {
        id: "bk_m1",
        question: "In which city and state did Dr. James Naismith invent basketball in December 1891?",
        options: ["Springfield, Massachusetts", "Boston, Massachusetts", "New York City, New York", "Chicago, Illinois"],
        correctAnswer: "A",
        explanation: "Basketball was invented in December 1891 at the YMCA International Training School in Springfield, Massachusetts.",
        source: "historical"
      },
      {
        id: "bk_m2",
        question: "On March 2, 1962, who scored an unbroken record of 100 points in a single NBA game?",
        options: ["Michael Jordan", "Wilt Chamberlain", "Kobe Bryant", "Kareem Abdul-Jabbar"],
        correctAnswer: "B",
        explanation: "Wilt Chamberlain of the Philadelphia Warriors scored a historic 100 points against the Knicks, a record that still stands.",
        source: "historical"
      },
      {
        id: "bk_m3",
        question: "Which two NBA franchises are tied for the most NBA championships in league history?",
        options: ["Golden State Warriors & Miami Heat", "Boston Celtics & Los Angeles Lakers", "Chicago Bulls & San Antonio Spurs", "New York Knicks & Detroit Pistons"],
        correctAnswer: "B",
        explanation: "The Boston Celtics and Los Angeles Lakers are tied with 17 NBA championships each.",
        source: "live"
      },
      {
        id: "bk_m4",
        question: "What was the NBA called when it was first founded in 1946?",
        options: ["BAA (Basketball Association of America)", "NBL (National Basketball League)", "ABA (American Basketball Association)", "USA Basketball"],
        correctAnswer: "A",
        explanation: "The league was founded as the Basketball Association of America (BAA) in 1946 before merging with the NBL in 1949.",
        source: "historical"
      }
    ],
    "Hard": [
      {
        id: "bk_h1",
        question: "Against which NBA team did Wilt Chamberlain score his historic 100-point game on March 2, 1962?",
        options: ["New York Knicks", "Boston Celtics", "Los Angeles Lakers", "Philadelphia 76ers"],
        correctAnswer: "A",
        explanation: "Chamberlain set the legendary record against the New York Knicks in a game played in Hershey, Pennsylvania.",
        source: "historical"
      },
      {
        id: "bk_h2",
        question: "In 1949, the BAA merged with which rival league to officially form the NBA?",
        options: ["National Basketball League (NBL)", "American Basketball Association (ABA)", "College Basketball Association", "Continental Basketball Association"],
        correctAnswer: "A",
        explanation: "The merger with the National Basketball League (NBL) created the National Basketball Association.",
        source: "historical"
      },
      {
        id: "bk_h3",
        question: "Who is the NBA's all-time leading scorer in regular season history?",
        options: ["Michael Jordan", "Kareem Abdul-Jabbar", "LeBron James", "Karl Malone"],
        correctAnswer: "C",
        explanation: "LeBron James broke Kareem Abdul-Jabbar's long-standing scoring record in February 2023.",
        source: "live"
      },
      {
        id: "bk_h4",
        question: "What is the official diameter in inches of a regulation NBA basketball rim?",
        options: ["16 inches", "18 inches", "20 inches", "22 inches"],
        correctAnswer: "B",
        explanation: "The inside diameter of a standard regulation basketball rim must be exactly 18 inches.",
        source: "historical"
      }
    ]
  }
};

// Supplementary Offline/Rate-limit Quiz Questions to double the fallback capacity
const EXTRA_QUIZZES: Record<string, Record<string, any[]>> = {
  "Cricket": {
    "Easy": [
      {
        id: "cf_e5",
        question: "What is the maximum number of overs a bowler can bowl in a standard T20 international match?",
        options: ["4 overs", "5 overs", "10 overs", "6 overs"],
        correctAnswer: "A",
        explanation: "In T20 cricket, a single bowler is limited to a maximum of 4 overs.",
        source: "historical"
      },
      {
        id: "cf_e6",
        question: "Which of these is NOT an official dismissal type in a standard game of cricket?",
        options: ["Bowled", "Stumped", "Landed", "Run out"],
        correctAnswer: "C",
        explanation: "The ten dismissal types in cricket include Bowled, Caught, Stumped, Run out, LBW, etc. 'Landed' is not a dismissal.",
        source: "historical"
      }
    ],
    "Medium": [
      {
        id: "cf_m5",
        question: "Which country won the inaugural ICC T20 World Cup in 2007?",
        options: ["India", "Pakistan", "Australia", "West Indies"],
        correctAnswer: "A",
        explanation: "India defeated Pakistan by 5 runs in a thrilling final in Johannesburg to win the inaugural 2007 T20 World Cup.",
        source: "historical"
      },
      {
        id: "cf_m6",
        question: "Who was the first cricketer to hit six sixes in an over in a T20 International match?",
        options: ["Yuvraj Singh", "Chris Gayle", "Kieron Pollard", "Herschelle Gibbs"],
        correctAnswer: "A",
        explanation: "India's Yuvraj Singh hit Stuart Broad for six sixes in an over during the 2007 T20 World Cup.",
        source: "historical"
      }
    ],
    "Hard": [
      {
        id: "cf_h5",
        question: "Who is the only player to have scored a quadruple century (400 runs) in a single Test match innings?",
        options: ["Brian Lara", "Sachin Tendulkar", "Matthew Hayden", "Mahela Jayawardene"],
        correctAnswer: "A",
        explanation: "West Indies legend Brian Lara scored 400 not out against England in Antigua in 2004.",
        source: "historical"
      },
      {
        id: "cf_h6",
        question: "In which year were the first official laws of cricket written down and codified?",
        options: ["1744", "1787", "1835", "1877"],
        correctAnswer: "A",
        explanation: "The first known codification of the Laws of Cricket was drawn up in 1744 by a committee of noblemen.",
        source: "historical"
      }
    ]
  },
  "Football": {
    "Easy": [
      {
        id: "ff_e5",
        question: "What color card does a referee show to a player to order them off the field for a serious offense?",
        options: ["Yellow card", "Red card", "Green card", "Blue card"],
        correctAnswer: "B",
        explanation: "A red card signifies immediate ejection from the game.",
        source: "historical"
      },
      {
        id: "ff_e6",
        question: "How many periodic halves are played in a standard football match?",
        options: ["2 halves", "4 quarters", "3 periods", "1 single game"],
        correctAnswer: "A",
        explanation: "A standard professional football match is split into 2 halves of 45 minutes each.",
        source: "historical"
      }
    ],
    "Medium": [
      {
        id: "ff_m5",
        question: "Which country won the 2022 FIFA World Cup held in Qatar?",
        options: ["France", "Argentina", "Croatia", "Morocco"],
        correctAnswer: "B",
        explanation: "Argentina defeated France on penalties after a spectacular 3-3 draw to lift the 2022 World Cup.",
        source: "live"
      },
      {
        id: "ff_m6",
        question: "Which country has reached the most FIFA World Cup finals but never won the tournament?",
        options: ["Netherlands", "Sweden", "Croatia", "Hungary"],
        correctAnswer: "A",
        explanation: "The Netherlands reached the World Cup final three times (1974, 1978, 2010) but lost all of them.",
        source: "historical"
      }
    ],
    "Hard": [
      {
        id: "ff_h5",
        question: "Who was the first goalkeeper to win the prestigious Ballon d'Or award in football history (1963)?",
        options: ["Lev Yashin", "Gianluigi Buffon", "Oliver Kahn", "Dino Zoff"],
        correctAnswer: "A",
        explanation: "Soviet legend Lev Yashin, nicknamed the 'Black Spider', is the only goalkeeper to ever win the Ballon d'Or.",
        source: "historical"
      },
      {
        id: "ff_h6",
        question: "Which club holds the record for the longest unbeaten run in Premier League history, at 49 games?",
        options: ["Manchester United", "Arsenal", "Chelsea", "Manchester City"],
        correctAnswer: "B",
        explanation: "Arsenal's 'Invincibles' went undefeated for 49 consecutive league matches between May 2003 and October 2004.",
        source: "historical"
      }
    ]
  },
  "Badminton": {
    "Easy": [
      {
        id: "bf_e5",
        question: "What is the name of the international governing body for the sport of badminton?",
        options: ["BWF (Badminton World Federation)", "IBA", "WBF", "FIB"],
        correctAnswer: "A",
        explanation: "The Badminton World Federation (BWF) is the international governing body recognized by the IOC.",
        source: "historical"
      },
      {
        id: "bf_e6",
        question: "In badminton, the game starts with a serve from which side of the court when the server's score is even?",
        options: ["Right side", "Left side", "Center court", "Any side of choice"],
        correctAnswer: "A",
        explanation: "Serves are delivered from the right service court when the server has an even number of points (0, 2, 4, etc.).",
        source: "historical"
      }
    ],
    "Medium": [
      {
        id: "bf_m5",
        question: "Who is the legendary Chinese player widely regarded as the greatest badminton player of all time, winning 2 Olympic gold medals?",
        options: ["Lin Dan", "Lee Chong Wei", "Chen Long", "Taufik Hidayat"],
        correctAnswer: "A",
        explanation: "Lin Dan completed the 'Super Grand Slam' by age 28, winning all nine major titles in the badminton world.",
        source: "historical"
      },
      {
        id: "bf_m6",
        question: "Which country has won the most Thomas Cup men's team championship titles in history?",
        options: ["China", "Indonesia", "Malaysia", "Denmark"],
        correctAnswer: "B",
        explanation: "Indonesia has won the Thomas Cup a record 14 times since the tournament's inception.",
        source: "historical"
      }
    ],
    "Hard": [
      {
        id: "bf_h5",
        question: "Who was the first female Indian badminton player to win an individual Olympic silver medal, achieving this at Rio 2016?",
        options: ["Saina Nehwal", "P.V. Sindhu", "Jwala Gutta", "Ashwini Ponnappa"],
        correctAnswer: "B",
        explanation: "P.V. Sindhu made history at the 2016 Summer Olympics by winning the silver medal in women's singles.",
        source: "live"
      },
      {
        id: "bf_h6",
        question: "What is the standard width of a singles badminton court?",
        options: ["5.18 meters", "6.10 meters", "4.50 meters", "5.50 meters"],
        correctAnswer: "A",
        explanation: "The court width is 5.18 meters (17 feet) for singles, and expands to 6.10 meters (20 feet) for doubles.",
        source: "historical"
      }
    ]
  },
  "Tennis": {
    "Easy": [
      {
        id: "tf_e5",
        question: "How many sets must a male player win to win a match in a standard Grand Slam tournament?",
        options: ["2 sets", "3 sets", "4 sets", "5 sets"],
        correctAnswer: "B",
        explanation: "In men's Grand Slam singles, matches are played under best-of-five sets, meaning a player must win exactly 3 sets.",
        source: "historical"
      },
      {
        id: "tf_e6",
        question: "What color are tennis balls used in almost all professional modern tournaments?",
        options: ["Yellow", "White", "Green", "Orange"],
        correctAnswer: "A",
        explanation: "Optic yellow balls were introduced in 1972 to make them more visible to television viewers.",
        source: "historical"
      }
    ],
    "Medium": [
      {
        id: "tf_m5",
        question: "Which female tennis player holds the record for the most Grand Slam singles titles in the Open Era, with 23 trophies?",
        options: ["Serena Williams", "Steffi Graf", "Martina Navratilova", "Margaret Court"],
        correctAnswer: "A",
        explanation: "Serena Williams won 23 Grand Slam singles titles, the most of any player in the Open Era.",
        source: "live"
      },
      {
        id: "tf_m6",
        question: "Which country does superstar Novak Djokovic represent in international tennis?",
        options: ["Croatia", "Serbia", "Slovakia", "Slovenia"],
        correctAnswer: "B",
        explanation: "Novak Djokovic is a proud Serbian athlete, winning multiple Davis Cup titles and Olympic medals for Serbia.",
        source: "live"
      }
    ],
    "Hard": [
      {
        id: "tf_h5",
        question: "In 2001, who became the youngest male player ever to be ranked World No. 1, at just 20 years of age?",
        options: ["Lleyton Hewitt", "Marat Safin", "Pete Sampras", "Andy Roddick"],
        correctAnswer: "A",
        explanation: "Australia's Lleyton Hewitt achieved the World No. 1 ranking at age 20 in November 2001.",
        source: "historical"
      },
      {
        id: "tf_h6",
        question: "Which Grand Slam tournament is played on traditional DecoTurf hard courts in New York City?",
        options: ["US Open", "Australian Open", "French Open", "Wimbledon"],
        correctAnswer: "A",
        explanation: "The US Open is held annually at the USTA Billie Jean King National Tennis Center in Queens, New York, on hard courts.",
        source: "live"
      }
    ]
  },
  "Basketball": {
    "Easy": [
      {
        id: "bk_e5",
        question: "What is the standard maximum number of fouls a player can commit before being fouled out in an NBA game?",
        options: ["5 fouls", "6 fouls", "7 fouls", "4 fouls"],
        correctAnswer: "B",
        explanation: "An NBA player is disqualified from the game upon committing their 6th personal foul.",
        source: "historical"
      },
      {
        id: "bk_e6",
        question: "How many points is a shot worth when taken from outside the marked semi-circular arc on the court?",
        options: ["2 points", "3 points", "4 points", "1 point"],
        correctAnswer: "B",
        explanation: "Shots scored from beyond the three-point arc are worth exactly 3 points.",
        source: "historical"
      }
    ],
    "Medium": [
      {
        id: "bk_m5",
        question: "Which legendary center, nicknamed 'The Diesel', won 3 consecutive Finals MVP awards with the LA Lakers (2000-2002)?",
        options: ["Shaquille O'Neal", "Kobe Bryant", "Tim Duncan", "Hakeem Olajuwon"],
        correctAnswer: "A",
        explanation: "Shaquille O'Neal dominated the NBA from 2000 to 2002, leading the Lakers to a legendary three-peat.",
        source: "historical"
      },
      {
        id: "bk_m6",
        question: "Which NBA team holds the record for the most regular-season wins in a single season, with 73 wins?",
        options: ["Chicago Bulls", "Golden State Warriors", "Boston Celtics", "Los Angeles Lakers"],
        correctAnswer: "B",
        explanation: "The 2015-16 Golden State Warriors set the record by going 73-9 in the regular season.",
        source: "live"
      }
    ],
    "Hard": [
      {
        id: "bk_h5",
        question: "Which player has won the most NBA championship rings in history, holding 11 titles with the Boston Celtics?",
        options: ["Bill Russell", "Sam Jones", "Kareem Abdul-Jabbar", "Bob Cousy"],
        correctAnswer: "A",
        explanation: "Boston Celtics legendary center Bill Russell won 11 NBA championships during his illustrious 13-year career.",
        source: "historical"
      },
      {
        id: "bk_h6",
        question: "Who was the first NBA player to win the Regular Season MVP award unanimously, achieving this in 2016?",
        options: ["Stephen Curry", "LeBron James", "Michael Jordan", "Kevin Durant"],
        correctAnswer: "A",
        explanation: "Stephen Curry won the first and only unanimous MVP in NBA history in 2016.",
        source: "live"
      }
    ]
  }
};

// Helper utility to shuffle array elements (Fisher-Yates)
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Fallback generator for unmapped sports or difficulties
function generateDynamicFallback(sport: string, difficulty: string): any[] {
  // General default fallback quiz for other sports (Formula 1, Swimming, Athletics, etc.)
  const generalPool: Record<string, any[]> = {
    "Athletics": [
      {
        id: "at_1",
        question: "Who is widely considered the fastest human in history, holding the 100m world record at 9.58 seconds?",
        options: ["Carl Lewis", "Usain Bolt", "Tyson Gay", "Yohan Blake"],
        correctAnswer: "B",
        explanation: "Usain Bolt of Jamaica set the 100-meter sprint world record with an incredible time of 9.58 seconds in Berlin in 2009.",
        source: "historical"
      },
      {
        id: "at_2",
        question: "What is the standard distance of a full marathon race?",
        options: ["21.1 kilometers", "42.195 kilometers", "50.0 kilometers", "10.0 kilometers"],
        correctAnswer: "B",
        explanation: "A standard marathon length is officially 42.195 kilometers (26 miles 385 yards).",
        source: "historical"
      },
      {
        id: "at_3",
        question: "Who was the first person in history to run a mile in under 4 minutes, in 1954?",
        options: ["Roger Bannister", "John Landy", "Hicham El Guerrouj", "Sebastian Coe"],
        correctAnswer: "A",
        explanation: "Roger Bannister of Great Britain ran the first sub-4-minute mile in 3 minutes 59.4 seconds on May 6, 1954.",
        source: "historical"
      },
      {
        id: "at_4",
        question: "What is the standard length of one full lap around an Olympic running track?",
        options: ["200 meters", "400 meters", "500 meters", "800 meters"],
        correctAnswer: "B",
        explanation: "A standard Olympic outdoor athletics track measures exactly 400 meters for one complete circuit.",
        source: "historical"
      },
      {
        id: "at_5",
        question: "Which country has won the most gold medals in Olympic track and field history?",
        options: ["Jamaica", "United States", "Great Britain", "Kenya"],
        correctAnswer: "B",
        explanation: "The United States has won over 340 gold medals in Athletics, far more than any other nation.",
        source: "historical"
      },
      {
        id: "at_6",
        question: "What is the standard weight of a men's shot put in senior competition?",
        options: ["5.0 kg", "7.26 kg (16 lbs)", "8.0 kg", "6.0 kg"],
        correctAnswer: "B",
        explanation: "The regulation men's shot put weight for adult and professional competitions is exactly 7.26 kg (16 pounds).",
        source: "historical"
      }
    ],
    "Formula 1": [
      {
        id: "f1_1",
        question: "Which team has won the most World Constructor Championships in F1 history?",
        options: ["Mercedes", "Red Bull Racing", "Scuderia Ferrari", "McLaren"],
        correctAnswer: "C",
        explanation: "Ferrari holds the record for the most Constructor Championships, representing rich heritage in motorsports.",
        source: "historical"
      },
      {
        id: "f1_2",
        question: "Lewis Hamilton holds the record for the most Grand Prix wins in history. With which team did he win 6 of his 7 titles?",
        options: ["McLaren", "Ferrari", "Mercedes-AMG", "Red Bull"],
        correctAnswer: "C",
        explanation: "Hamilton won his first world title with McLaren in 2008 and his remaining six with Mercedes.",
        source: "live"
      },
      {
        id: "f1_3",
        question: "What color flag is waved in Formula 1 to indicate the end of a race session?",
        options: ["Yellow flag", "Red flag", "Chequered flag", "Green flag"],
        correctAnswer: "C",
        explanation: "A black-and-white chequered flag is traditionally waved at the finish line to signify the race is completed.",
        source: "historical"
      },
      {
        id: "f1_4",
        question: "Which famous street circuit hosts the most historic and prestigious Grand Prix in F1?",
        options: ["Silverstone Circuit", "Monza Circuit", "Circuit de Monaco", "Spa-Francorchamps"],
        correctAnswer: "C",
        explanation: "Monaco is celebrated worldwide as the jewel in the F1 calendar, first held in 1929.",
        source: "historical"
      },
      {
        id: "f1_5",
        question: "What is the name of the legendary Brazilian F1 driver who won 3 World Championships before his tragic accident in 1994?",
        options: ["Alain Prost", "Ayrton Senna", "Nelson Piquet", "Emerson Fittipaldi"],
        correctAnswer: "B",
        explanation: "Ayrton Senna won world championships in 1988, 1990, and 1991 and is widely considered one of the greatest F1 drivers ever.",
        source: "historical"
      },
      {
        id: "f1_6",
        question: "How many F1 World Championships did German driver Sebastian Vettel win in his career?",
        options: ["2 titles", "3 titles", "4 titles", "5 titles"],
        correctAnswer: "C",
        explanation: "Sebastian Vettel won 4 consecutive F1 World Championships with Red Bull Racing from 2010 to 2013.",
        source: "historical"
      }
    ],
    "Swimming": [
      {
        id: "sw_1",
        question: "Who is the most decorated Olympian of all time, holding a total of 23 gold medals in swimming?",
        options: ["Michael Phelps", "Ian Thorpe", "Caeleb Dressel", "Ryan Lochte"],
        correctAnswer: "A",
        explanation: "Michael Phelps has won 28 Olympic medals overall, including a historic 23 gold medals.",
        source: "historical"
      },
      {
        id: "sw_2",
        question: "How long is a standard Olympic-size competition swimming pool?",
        options: ["25 meters", "50 meters", "100 meters", "75 meters"],
        correctAnswer: "B",
        explanation: "Olympic swimming pools are exactly 50 meters long and at least 25 meters wide.",
        source: "historical"
      },
      {
        id: "sw_3",
        question: "How many gold medals did Michael Phelps win in a single Olympic Games at Beijing 2008?",
        options: ["7 gold medals", "8 gold medals", "9 gold medals", "10 gold medals"],
        correctAnswer: "B",
        explanation: "Phelps made history in Beijing by winning 8 gold medals, breaking Mark Spitz's 1972 record of 7.",
        source: "historical"
      },
      {
        id: "sw_4",
        question: "Which swimming stroke is generally considered the fastest in competition?",
        options: ["Breaststroke", "Butterfly stroke", "Backstroke", "Front Crawl (Freestyle)"],
        correctAnswer: "D",
        explanation: "Front Crawl is the fastest swimming stroke, which is why it is preferred for all freestyle events.",
        source: "historical"
      },
      {
        id: "sw_5",
        question: "Which swimming stroke is generally considered the slowest in competition?",
        options: ["Breaststroke", "Butterfly stroke", "Backstroke", "Sidestroke"],
        correctAnswer: "A",
        explanation: "The breaststroke is scientifically the slowest stroke due to the massive drag generated during the leg kick recovery.",
        source: "historical"
      },
      {
        id: "sw_6",
        question: "Who is widely regarded as the greatest female distance swimmer, holding world records in the 800m and 1500m freestyle?",
        options: ["Missy Franklin", "Katie Ledecky", "Ariarne Titmus", "Summer McIntosh"],
        correctAnswer: "B",
        explanation: "Katie Ledecky of the United States has dominated long-distance swimming for over a decade, claiming multiple Olympic and World titles.",
        source: "live"
      }
    ]
  };

  let rawQuestions: any[] = [];

  // 1. Select the base questions from our mapping and append any extra ones
  if (FALLBACK_QUIZZES[sport] && FALLBACK_QUIZZES[sport][difficulty]) {
    rawQuestions = [...FALLBACK_QUIZZES[sport][difficulty]];
    if (EXTRA_QUIZZES[sport] && EXTRA_QUIZZES[sport][difficulty]) {
      rawQuestions.push(...EXTRA_QUIZZES[sport][difficulty]);
    }
  } else if (FALLBACK_QUIZZES[sport]) {
    const keys = Object.keys(FALLBACK_QUIZZES[sport]);
    if (keys.length > 0) {
      const selectedKey = keys[0];
      rawQuestions = [...FALLBACK_QUIZZES[sport][selectedKey]];
      if (EXTRA_QUIZZES[sport] && EXTRA_QUIZZES[sport][selectedKey]) {
        rawQuestions.push(...EXTRA_QUIZZES[sport][selectedKey]);
      }
    }
  } else if (generalPool[sport]) {
    rawQuestions = [...generalPool[sport]];
  } else {
    // Absolute fallback (Default to Cricket easy)
    rawQuestions = [...FALLBACK_QUIZZES["Cricket"]["Easy"]];
    if (EXTRA_QUIZZES["Cricket"] && EXTRA_QUIZZES["Cricket"]["Easy"]) {
      rawQuestions.push(...EXTRA_QUIZZES["Cricket"]["Easy"]);
    }
  }

  // 2. Clone and fully randomize each question's options and correct answer to ensure maximum uniqueness!
  const randomizedQuestions = rawQuestions.map(q => {
    const originalOptions = [...q.options];
    const originalCorrectAnswer = q.correctAnswer; // "A", "B", "C", or "D"
    const correctOptionIndex = originalCorrectAnswer.charCodeAt(0) - 65; // 0, 1, 2, or 3
    const correctOptionText = originalOptions[correctOptionIndex];

    // Shuffle the options array
    const shuffledOptions = shuffleArray(originalOptions);

    // Find where the correct answer ended up in the shuffled options
    const newCorrectIndex = shuffledOptions.indexOf(correctOptionText);
    const newCorrectAnswer = String.fromCharCode(65 + (newCorrectIndex >= 0 ? newCorrectIndex : 0)); // Match index to "A", "B", "C", or "D"

    return {
      ...q,
      options: shuffledOptions,
      correctAnswer: newCorrectAnswer
    };
  });

  // 3. Shuffle the order of the questions themselves and slice exactly 4 so we have a diverse subset each time
  return shuffleArray(randomizedQuestions).slice(0, 4);
}

// POST route to generate a quiz
app.post("/api/generate-quiz", async (req, res) => {
  const { sport, difficulty } = req.body;

  if (!sport || !difficulty) {
    return res.status(400).json({ success: false, error: "Missing required fields 'sport' or 'difficulty'." });
  }

  let retrievedFacts: Fact[] = [];
  try {
    // 1. Vector Database Query (Historical Context)
    const dbQuery = `${sport} history cups rules tournaments records achievements champion`;
    // Query a wider pool of matched facts and randomly select 2 of them to ensure distinct context on each generation!
    const widerPool = await queryHistoricFacts(sport, dbQuery, 6);
    if (widerPool && widerPool.length > 0) {
      retrievedFacts = shuffleArray(widerPool).slice(0, 2);
    }
  } catch (dbErr) {
    console.warn("Vector DB: Fetch failed, continuing with generation fallback:", dbErr);
  }

  const historicalContextText = retrievedFacts.map(f => `- ${f.fact}`).join("\n");

  try {
    const ai = getAI();

    // 2. Generate Content using RAG (Vector DB context + Live Google Search Grounding)
    const systemInstruction = `You are an expert sports quiz creator. Your job is to write a highly engaging, unique 4-question multiple-choice quiz about the sport "${sport}" at a "${difficulty}" difficulty level.
To ensure the quiz is factually grounded, informative, and fresh, you must blend two sources of context:
1. HISTORICAL CONTEXT: Use the provided historical facts retrieved from our vector database. At least 1-2 questions should test these historical moments.
2. LIVE SEARCH CONTEXT: You must use the googleSearch tool to perform search queries for recent sports news, matches, roster changes, or tournament champions (such as 2024 or 2026 events, winners, and developments). At least 1-2 questions should test these fresh updates.

=== HISTORICAL CONTEXT (Local Vector DB) ===
${historicalContextText || "No local offline facts recorded for this sport. Use Google Search to query both historical milestones and recent achievements."}

Strict Rules:
- Avoid hallucinations. Keep descriptions, numbers, and dates completely accurate to either the provided historical facts or the live search results.
- For each question, specify the source of information: 'historical' (if based on our local Vector DB), 'live' (if based on recent Google Search results), or 'mixed' (if combining elements of both).
- Make option options clear and distinct. Return exactly 4 options.
- ALWAYS generate a fresh, unique, and highly diverse set of questions. Never repeat the exact same questions from previous requests.
`;

    // Inject a random seed to prompt to prevent cached responses and encourage diversity!
    const randomSalt = Math.floor(Math.random() * 1000000);
    const userPrompt = `Generate exactly 4 unique multiple-choice questions for the sport: ${sport}.
Difficulty target: ${difficulty}.
Prompt randomizer ID: ${randomSalt}.
Please cover varied topics, unique moments, and avoid standard well-known trivia.
Make sure to query the web for fresh, up-to-date ${sport} tournament results, championship winners, or current news from recent months to ground the current event questions.
`;

    console.log(`RAG Agent: Launching Gemini Quiz Generation for sport: "${sport}" (${difficulty}) with random seed ${randomSalt}`);

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction,
        // Active Google Search Grounding tool
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        temperature: 1.0, // High temperature to maximize variety and creative divergence
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            sport: { type: Type.STRING },
            difficulty: { type: Type.STRING },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: "A short unique string id, e.g., q1, q2" },
                  question: { type: Type.STRING, description: "The quiz question text." },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "An array of exactly 4 strings representing options A, B, C, D in order."
                  },
                  correctAnswer: { type: Type.STRING, description: "Must be exactly 'A', 'B', 'C', or 'D'" },
                  explanation: { type: Type.STRING, description: "Clear, highly informative explanation citing facts from the source." },
                  source: { type: Type.STRING, description: "Must be 'historical', 'live', or 'mixed'" }
                },
                required: ["id", "question", "options", "correctAnswer", "explanation", "source"]
              }
            }
          },
          required: ["sport", "difficulty", "questions"]
        }
      }
    });

    const quizText = response.text;
    if (!quizText) {
      throw new Error("No text output received from Gemini API.");
    }

    // Parse the generated quiz JSON
    const quizData = JSON.parse(quizText);

    // Extract search grounding metadata to display Web Sources to the user
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const webSources = groundingChunks
      .filter((chunk: any) => chunk.web)
      .map((chunk: any) => ({
        title: chunk.web.title,
        uri: chunk.web.uri,
      }));

    console.log(`RAG Agent: Successfully generated quiz for "${sport}". Found ${webSources.length} live web sources.`);

    res.json({
      success: true,
      quiz: quizData,
      retrievedFacts: retrievedFacts.map(rf => ({ sport: rf.sport, fact: rf.fact })),
      webSources,
      isFallback: false
    });

  } catch (err: any) {
    console.warn("RAG Agent: Gemini API returned an error (likely quota exhaustion or API key issue). Triggering bulletproof local fallback generator.", err);

    // Compile fallback quiz dynamically using the premium fallback database
    const fallbackQuestions = generateDynamicFallback(sport, difficulty);
    const quizData = {
      sport,
      difficulty,
      questions: fallbackQuestions
    };

    // Synthesize local retrieved facts matching the sport for the inspector
    const matchedLocalFacts = retrievedFacts.length > 0 
      ? retrievedFacts.map(rf => ({ sport: rf.sport, fact: rf.fact }))
      : cachedFacts.filter(f => f.sport.toLowerCase() === sport.toLowerCase()).map(f => ({ sport: f.sport, fact: f.fact }));

    // Synthesize dummy web links to explain that we are working in offline recovery mode
    const webSources = [
      {
        title: "Gemini 3.5 Quota Limit Reached - Offline Fallback Activated",
        uri: "https://ai.google.dev/gemini-api/docs/rate-limits"
      },
      {
        title: "Official Sports Milestone Database (RAG Grounding Backup)",
        uri: "https://ais-dev-jwehg5dhfu2zns5xq64hgl-725070093915.asia-east1.run.app"
      }
    ];

    res.json({
      success: true,
      quiz: quizData,
      retrievedFacts: matchedLocalFacts,
      webSources,
      isFallback: true,
      fallbackMessage: err.message || "Quota limit reached"
    });
  }
});

// App health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date() });
});

// Serve frontend assets
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development server loaded as Express middleware.");
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log("Serving static production assets from /dist.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
