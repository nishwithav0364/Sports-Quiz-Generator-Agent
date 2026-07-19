import streamlit as st
import json
from src.config import validate_config
from src.database import get_historical_context
from src.search import search_live_news
from src.generator import generate_sports_quiz

# Set page configurations
st.set_page_config(
    page_title="Sports Quiz Generator Agent",
    page_icon="🏆",
    layout="centered"
)

# Initialize Session State variables for interactive gameplay
if "quiz" not in st.session_state:
    st.session_state.quiz = None
if "answers" not in st.session_state:
    st.session_state.answers = {}
if "submitted" not in st.session_state:
    st.session_state.submitted = False
if "historical_context" not in st.session_state:
    st.session_state.historical_context = []
if "search_context" not in st.session_state:
    st.session_state.search_context = []
if "is_fallback" not in st.session_state:
    st.session_state.is_fallback = False

# Validate initial config and detect Gemini availability
has_gemini = validate_config()

# Custom CSS for polished typography, spacing, and animations
st.markdown("""
<style>
    .main {
        background-color: #0f172a;
        color: #f8fafc;
    }
    .quiz-title {
        font-size: 2.5rem;
        font-weight: 800;
        text-align: center;
        background: linear-gradient(135deg, #38bdf8, #818cf8);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin-bottom: 0.5rem;
    }
    .quiz-subtitle {
        text-align: center;
        color: #94a3b8;
        font-size: 1rem;
        margin-bottom: 2rem;
    }
    .custom-card {
        background-color: #1e293b;
        padding: 1.5rem;
        border-radius: 1rem;
        border: 1px solid #334155;
        margin-bottom: 1.5rem;
    }
    .source-badge {
        display: inline-block;
        padding: 0.25rem 0.6rem;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 600;
        margin-bottom: 0.5rem;
    }
    .source-historical {
        background-color: rgba(56, 189, 248, 0.15);
        color: #38bdf8;
        border: 1px solid rgba(56, 189, 248, 0.3);
    }
    .source-live {
        background-color: rgba(34, 197, 94, 0.15);
        color: #4ade80;
        border: 1px solid rgba(34, 197, 94, 0.3);
    }
    .option-btn {
        display: block;
        width: 100%;
        text-align: left;
        padding: 0.75rem 1rem;
        margin: 0.4rem 0;
        border-radius: 0.5rem;
        border: 1px solid #475569;
        background-color: #1e293b;
        color: #f8fafc;
        cursor: pointer;
        transition: all 0.2s ease;
    }
    .option-btn:hover {
        background-color: #334155;
        border-color: #64748b;
    }
</style>
""", unsafe_allow_html=True)

# Main layout header
st.markdown("<h1 class='quiz-title'>🏆 Sports Quiz Generator Agent</h1>", unsafe_allow_html=True)
st.markdown("<p class='quiz-subtitle'>Powered by Vector RAG Database & Live Search Grounding</p>", unsafe_allow_html=True)

# Sidebar with configuration and agent status
with st.sidebar:
    st.header("⚙️ Agent Settings")
    sport_selection = st.selectbox(
        "Select Sport:",
        ["Cricket", "Football", "Badminton", "Tennis", "Basketball", "Athletics", "Formula 1", "Swimming"]
    )
    
    difficulty_selection = st.selectbox(
        "Select Difficulty:",
        ["Easy", "Medium", "Hard"]
    )
    
    st.divider()
    if not has_gemini:
        st.warning("Running in offline fallback mode. Set GEMINI_API_KEY in your environment to enable Gemini-grounded quiz generation.")
    st.subheader("💡 RAG System Info")
    st.info("""
    **How it works:**
    1. **Vector DB (Historical)**: Retrieves historic sports facts from the local ChromaDB.
    2. **Live Search Grounding**: Searches DuckDuckGo for recent news and tournament updates.
    3. **Gemini LLM**: Creates a custom, grounded quiz from the merged contexts!
    """)

# Action button to trigger new quiz generation
if st.button("🔥 Generate New Quiz", use_container_width=True):
    with st.spinner(f"Agent generating grounded {sport_selection} quiz..."):
        if has_gemini:
            # 1. Fetch from Vector DB (Historical)
            db_query = f"{sport_selection} history tournaments champion trophies gold rules"
            hist_facts = get_historical_context(sport_selection, query=db_query, n_results=2)
            st.session_state.historical_context = hist_facts
            
            # 2. Fetch from DuckDuckGo (Live Search)
            search_query = "latest matches champions news 2024 2026 achievements"
            live_news = search_live_news(sport_selection, query=search_query, max_results=2)
            st.session_state.search_context = live_news
        else:
            hist_facts = []
            live_news = []
            st.session_state.historical_context = []
            st.session_state.search_context = []
        
        # 3. Generate quiz with Gemini or fast local fallback
        quiz_data, is_fallback = generate_sports_quiz(
            sport=sport_selection,
            difficulty=difficulty_selection,
            historical_facts=hist_facts,
            live_news=live_news
        )
        
        # Store in session state
        st.session_state.quiz = quiz_data
        st.session_state.answers = {}
        st.session_state.submitted = False
        st.session_state.is_fallback = is_fallback

# Render generated quiz if present
if st.session_state.quiz:
    quiz = st.session_state.quiz
    questions = quiz.get("questions", [])
    
    st.subheader(f"📝 {quiz.get('sport')} Quiz — {quiz.get('difficulty')} Level")
    
    if st.session_state.is_fallback:
        st.warning("⚠️ **Resilient Offline Mode Activated:** Gemini quota limit exceeded. Loaded premium pre-defined RAG quiz!")

    # Display each question
    for idx, q in enumerate(questions):
        st.markdown(f"### Q{idx+1}. {q.get('question')}")
        
        options = q.get("options", [])
        option_labels = ["A", "B", "C", "D"]
        
        # Selection options via radio or selectbox
        selected_option = st.radio(
            f"Select your answer for Question {idx+1}:",
            options,
            key=f"q_radio_{idx}",
            index=None if not st.session_state.submitted else options.index(st.session_state.answers.get(f"q_{idx}")) if f"q_{idx}" in st.session_state.answers else 0,
            disabled=st.session_state.submitted
        )
        
        if selected_option and not st.session_state.submitted:
            # Map choice back to letter label
            choice_idx = options.index(selected_option)
            st.session_state.answers[f"q_{idx}"] = option_labels[choice_idx]
            
        # If submitted, show beautiful colored feedback
        if st.session_state.submitted:
            correct_letter = q.get("correctAnswer", "A")
            correct_idx = option_labels.index(correct_letter)
            correct_text = options[correct_idx]
            
            user_letter = st.session_state.answers.get(f"q_{idx}")
            
            if user_letter == correct_letter:
                st.success(f"🎉 **Correct!** Selected: {selected_option}")
            else:
                st.error(f"❌ **Incorrect.** You selected: {selected_option or 'No Answer'}. Correct answer was **({correct_letter}) {correct_text}**")
                
            # Render Markdown Explanation
            st.info(f"💡 **Explanation:** {q.get('explanation')}")
        
        st.divider()
        
    # Submission controls
    if not st.session_state.submitted:
        if st.button("Submit Answers", use_container_width=True):
            st.session_state.submitted = True
            st.rerun()
    else:
        # Calculate score
        score = 0
        for idx, q in enumerate(questions):
            if st.session_state.answers.get(f"q_{idx}") == q.get("correctAnswer"):
                score += 1
                
        st.balloons() if score == len(questions) else None
        st.metric("Your Final Score", f"{score} / {len(questions)}")
        
        if st.button("Restart Quiz", use_container_width=True):
            st.session_state.submitted = False
            st.session_state.answers = {}
            st.rerun()

    # RAG Inspector section
    st.divider()
    st.subheader("🕵️ RAG Agent Inspector")
    
    with st.expander("🔍 View Retrieved Historical Facts (Local Vector DB)"):
        if st.session_state.historical_context:
            for item in st.session_state.historical_context:
                st.write(f"• **{item['sport']}**: {item['fact']}")
        else:
            st.write("No historical facts retrieved for this sport session.")
            
    with st.expander("🌐 View Grounded Live Web Sources"):
        if st.session_state.search_context:
            for item in st.session_state.search_context:
                st.markdown(f"- **[{item['title']}]({item['uri']})**")
                st.write(f"  *Snippet:* {item['body']}")
        else:
            st.write("No live web queries run in this session.")

else:
    st.markdown("""
    <div style="text-align: center; padding: 3rem; background-color: #1e293b; border-radius: 1rem; border: 1px dashed #475569;">
        <span style="font-size: 3rem;">👋</span>
        <h3>Welcome to the Sports Quiz Generator!</h3>
        <p style="color: #94a3b8;">Select a sport and difficulty in the sidebar, then click "Generate New Quiz" to get started.</p>
    </div>
    """, unsafe_allow_html=True)
