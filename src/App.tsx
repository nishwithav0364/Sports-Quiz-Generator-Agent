import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Trophy, 
  RotateCcw, 
  BookOpen, 
  Globe, 
  Database, 
  CheckCircle2, 
  XCircle, 
  Copy, 
  ExternalLink, 
  Sparkles, 
  TrendingUp, 
  Clock, 
  Volume2, 
  VolumeX, 
  HelpCircle,
  Award,
  Share2,
  ListFilter,
  Check,
  ChevronRight
} from "lucide-react";

// Types
interface Question {
  id: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  source: 'historical' | 'live' | 'mixed';
}

interface Quiz {
  sport: string;
  difficulty: string;
  questions: Question[];
}

interface RetrievedFact {
  sport: string;
  fact: string;
}

interface WebSource {
  title: string;
  uri: string;
}

interface DBFact {
  sport: string;
  fact: string;
}

export default function App() {
  // UI and Configuration State
  const [sport, setSport] = useState("Cricket");
  const [difficulty, setDifficulty] = useState("Medium");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Quiz Data State
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [isFallback, setIsFallback] = useState(false);

  // User Interactive Quiz State
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [copied, setCopied] = useState(false);

  // List of beautiful sports supported
  const sportsList = [
    { name: "Cricket", emoji: "🏏" },
    { name: "Football", emoji: "⚽" },
    { name: "Badminton", emoji: "🏸" },
    { name: "Tennis", emoji: "🎾" },
    { name: "Basketball", emoji: "🏀" },
    { name: "Athletics", emoji: "🏃" },
    { name: "Formula 1", emoji: "🏎️" },
    { name: "Swimming", emoji: "🏊" }
  ];

  // Cycling the loading messages to keep the user engaged
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      interval = setInterval(() => {
        setLoadingStep((prev) => (prev + 1) % 4);
      }, 2000);
    } else {
      setLoadingStep(0);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const loadingMessages = [
    "Searching persistent vector database for historic events...",
    "Querying live web search engines for recent championships...",
    "Reranking documents and filtering relevant sports records...",
    "Assembling grounded multiple-choice questions & double-checking details..."
  ];

  // API Call to generate fresh quiz
  const handleGenerateQuiz = async () => {
    setLoading(true);
    setError(null);
    setQuiz(null);
    setSelectedAnswers({});
    setCurrentQuestionIndex(0);
    setShowSummary(false);
    setIsFallback(false);

    try {
      const response = await fetch("/api/generate-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sport, difficulty })
      });

      const data = await response.json();
      if (data.success && data.quiz) {
        setQuiz(data.quiz);
        setIsFallback(data.isFallback || false);
        playAudio("success");
      } else {
        setError(data.error || "Failed to generate quiz. Please verify backend state.");
        playAudio("error");
      }
    } catch (err: any) {
      setError("Unable to communicate with the quiz generation server.");
      playAudio("error");
    } finally {
      setLoading(false);
    }
  };

  // Quick audio synthesis helper for responsive micro-interactions
  const playAudio = (type: "correct" | "incorrect" | "success" | "error") => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === "correct") {
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } else if (type === "incorrect") {
        osc.frequency.setValueAtTime(220.0, ctx.currentTime); // A3
        osc.frequency.setValueAtTime(196.0, ctx.currentTime + 0.15); // G3
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      } else if (type === "success") {
        osc.frequency.setValueAtTime(440.0, ctx.currentTime); // A4
        osc.frequency.setValueAtTime(554.37, ctx.currentTime + 0.08); // C#5
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.16); // E5
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      } else if (type === "error") {
        osc.frequency.setValueAtTime(150.0, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch (e) {
      // Audio fallback silent
    }
  };

  const handleSelectAnswer = (questionId: string, optionLetter: string) => {
    if (selectedAnswers[questionId]) return; // Already answered

    const currentQuestion = quiz?.questions.find(q => q.id === questionId);
    const isCorrect = currentQuestion?.correctAnswer === optionLetter;

    setSelectedAnswers(prev => ({ ...prev, [questionId]: optionLetter }));
    playAudio(isCorrect ? "correct" : "incorrect");
  };

  const currentQuestion = quiz?.questions[currentQuestionIndex];
  const totalQuestions = quiz?.questions.length || 0;
  const totalScore = quiz?.questions.filter(q => selectedAnswers[q.id] === q.correctAnswer).length || 0;

  // Format Social Media Copy Content
  const generateSocialCopy = () => {
    if (!quiz) return "";
    let copy = `🏆 ${quiz.sport} Quiz (${quiz.difficulty} Level) 🏆\n`;
    copy += `Grounded in RAG (Local Facts + Live Web Search)\n\n`;
    
    quiz.questions.forEach((q, idx) => {
      copy += `${idx + 1}. ${q.question}\n`;
      q.options.forEach((opt, oIdx) => {
        const letter = ["A", "B", "C", "D"][oIdx];
        copy += `   ${letter}) ${opt}\n`;
      });
      copy += `\n`;
    });

    copy += `💡 Guess the answers in the comments! 👇\n`;
    copy += `#SportsTrivia #SportsQuiz #TriviaTime #RAGAgent`;
    return copy;
  };

  const handleCopySocials = () => {
    navigator.clipboard.writeText(generateSocialCopy());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getScoreVerdict = () => {
    const pct = totalScore / totalQuestions;
    if (pct === 1) return { title: "Grand Champion! 👑", desc: "You scored a flawless victory! Your sports knowledge is absolute." };
    if (pct >= 0.75) return { title: "All-Star Pro! 🌟", desc: "Fantastic job! You've got an impressive handle on sports milestones." };
    if (pct >= 0.5) return { title: "Sports Enthusiast! 🏅", desc: "Decent game! Keep training and scouring the web for new facts." };
    return { title: "Rookie Prospect! 👟", desc: "Keep studying! Try inspecting the Ground Truth panel below to learn more." };
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-100 font-sans antialiased selection:bg-emerald-500 selection:text-[#0d1117]">
      {/* Visual Accent Glow Header */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-indigo-500 to-amber-500 shadow-md"></div>

      {/* Main Container */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        
        {/* Humble, Polished Title Row */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 pb-6 border-b border-gray-800">
          <div className="flex items-center space-x-3 mb-4 md:mb-0">
            <div className="p-2.5 bg-gradient-to-br from-emerald-500/20 to-indigo-500/20 rounded-xl border border-emerald-500/30 text-emerald-400">
              <Trophy className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Sports Quiz Generator
                <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 font-mono">
                  RAG-Agent
                </span>
              </h1>
            </div>
          </div>

          {/* Sound toggle and settings */}
          <div className="flex items-center space-x-3">
            <button 
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-2 rounded-lg bg-gray-800/50 hover:bg-gray-800 text-gray-400 hover:text-white border border-gray-700/50 transition"
              title={soundEnabled ? "Disable SFX" : "Enable SFX"}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Sidebar Settings - 4 Cols */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-6 shadow-xl">
              <h2 className="text-md font-semibold text-white mb-4 flex items-center gap-2">
                <ListFilter className="w-4 h-4 text-emerald-400" />
                Quiz Settings
              </h2>

              {/* Sport Selection */}
              <div className="space-y-2 mb-5">
                <label className="text-xs font-mono text-gray-400 uppercase tracking-wider block">
                  Select Sport Category
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {sportsList.map((item) => (
                    <button
                      key={item.name}
                      onClick={() => setSport(item.name)}
                      className={`flex items-center space-x-2 p-2.5 rounded-xl border text-left text-xs transition font-medium ${
                        sport === item.name 
                          ? "bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-sm" 
                          : "bg-gray-900/50 border-gray-800/80 hover:bg-gray-900 hover:border-gray-700 text-gray-300"
                      }`}
                    >
                      <span className="text-lg">{item.emoji}</span>
                      <span className="truncate">{item.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Difficulty Slider */}
              <div className="space-y-3 mb-6">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-mono text-gray-400 uppercase tracking-wider block">
                    Difficulty Level
                  </label>
                  <span className={`text-xs px-2 py-0.5 rounded-md font-mono font-semibold uppercase ${
                    difficulty === "Easy" ? "bg-emerald-500/10 text-emerald-400" :
                    difficulty === "Medium" ? "bg-amber-500/10 text-amber-400" :
                    "bg-rose-500/10 text-rose-400"
                  }`}>
                    {difficulty}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-gray-900 rounded-lg border border-gray-800">
                  {["Easy", "Medium", "Hard"].map((level) => (
                    <button
                      key={level}
                      onClick={() => setDifficulty(level)}
                      className={`py-1.5 rounded-md text-xs font-medium transition ${
                        difficulty === level 
                          ? "bg-gray-800 text-white shadow-sm font-semibold" 
                          : "text-gray-500 hover:text-gray-300"
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={handleGenerateQuiz}
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-emerald-950/20 disabled:opacity-50 transition duration-200 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-emerald-300 animate-pulse" />
                Generate Fresh Quiz
              </button>
            </div>
          </div>

          {/* Active Work Area - 8 Cols */}
          <div className="lg:col-span-8 space-y-8">
            {/* Loader State */}
            <AnimatePresence mode="wait">
                  {loading && (
                    <motion.div
                      key="loader"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      className="bg-[#161b22] border border-gray-800 rounded-3xl p-12 text-center flex flex-col items-center justify-center min-h-[400px] shadow-xl relative overflow-hidden"
                    >
                      {/* Ambient background decoration */}
                      <div className="absolute -top-20 -left-20 w-40 h-40 bg-emerald-500/5 rounded-full filter blur-2xl"></div>
                      <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-indigo-500/5 rounded-full filter blur-2xl"></div>

                      <div className="relative mb-6">
                        <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
                        <Trophy className="w-6 h-6 text-emerald-400 absolute inset-0 m-auto animate-pulse" />
                      </div>

                      <h3 className="text-lg font-bold text-white mb-2">Assembling Your Challenge</h3>
                      
                      <div className="h-10 max-w-md">
                        <AnimatePresence mode="wait">
                          <motion.p
                            key={loadingStep}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.3 }}
                            className="text-xs font-mono text-emerald-400 leading-relaxed"
                          >
                            {loadingMessages[loadingStep]}
                          </motion.p>
                        </AnimatePresence>
                      </div>

                      <div className="w-48 bg-gray-900 h-1.5 rounded-full overflow-hidden mt-6 border border-gray-800">
                        <motion.div 
                          className="bg-gradient-to-r from-emerald-500 to-indigo-500 h-full rounded-full"
                          animate={{ x: ["-100%", "100%"] }}
                          transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                        />
                      </div>
                    </motion.div>
                  )}

                  {/* Empty / Intro state */}
                  {!loading && !quiz && !error && (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="bg-[#161b22] border border-gray-800 rounded-3xl p-8 text-center min-h-[400px] flex flex-col items-center justify-center shadow-xl"
                    >
                      <div className="p-4 bg-emerald-500/10 rounded-full text-emerald-400 mb-5 border border-emerald-500/20">
                        <Sparkles className="w-10 h-10" />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2">Generate Your First Sports Quiz</h3>
                      <p className="text-sm text-gray-400 max-w-md leading-relaxed mb-6">
                        Select a sport and a difficulty level from the sidebar to compile an interactive RAG multiple-choice quiz grounded in historical details and live search results.
                      </p>
                      <button
                        onClick={handleGenerateQuiz}
                        className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold rounded-xl border border-gray-700 transition"
                      >
                        Let's Play!
                      </button>
                    </motion.div>
                  )}

                  {/* Error State */}
                  {error && (
                    <motion.div
                      key="error"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="bg-[#161b22] border border-rose-900/40 rounded-3xl p-8 text-center min-h-[400px] flex flex-col items-center justify-center shadow-xl"
                    >
                      <div className="p-3 bg-rose-500/10 rounded-full text-rose-400 mb-4 border border-rose-500/20">
                        <XCircle className="w-10 h-10" />
                      </div>
                      <h3 className="text-lg font-bold text-white mb-2">Quiz Generation Failed</h3>
                      <p className="text-sm text-rose-400/80 max-w-md leading-relaxed mb-6 font-mono text-xs p-3 bg-gray-950/50 rounded-xl border border-gray-800">
                        {error}
                      </p>
                      <button
                        onClick={handleGenerateQuiz}
                        className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold rounded-xl border border-gray-700 transition flex items-center gap-2"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Retry Generation
                      </button>
                    </motion.div>
                  )}

                  {/* Interactive Quiz Dashboard */}
                  {quiz && !loading && !error && !showSummary && (
                    <motion.div
                      key="quiz"
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-[#161b22] border border-gray-800 rounded-3xl p-6 md:p-8 shadow-xl"
                    >
                      {/* Active Quiz Header Info */}
                      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-gray-800">
                        <div className="flex items-center space-x-3">
                          <span className="text-2xl">
                            {sportsList.find(s => s.name === quiz.sport)?.emoji || "🏆"}
                          </span>
                          <div>
                            <h3 className="text-lg font-bold text-white">{quiz.sport} Trivia</h3>
                            <p className="text-xs text-gray-400 mt-0.5">
                              Question {currentQuestionIndex + 1} of {totalQuestions}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] font-mono bg-gray-900 text-gray-400 px-2.5 py-1 rounded border border-gray-800 uppercase tracking-wider">
                            Score: {totalScore}
                          </span>
                          <span className={`text-[10px] font-mono px-2.5 py-1 rounded border uppercase tracking-wider font-semibold ${
                            quiz.difficulty === "Easy" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" :
                            quiz.difficulty === "Medium" ? "bg-amber-500/10 text-amber-400 border-amber-500/25" :
                            "bg-rose-500/10 text-rose-400 border-rose-500/25"
                          }`}>
                            {quiz.difficulty}
                          </span>
                        </div>
                      </div>

                      {/* Global Progress Bar */}
                      <div className="w-full bg-gray-900 h-2 rounded-full overflow-hidden mb-8 border border-gray-800/80">
                        <div 
                          className="bg-gradient-to-r from-emerald-500 to-indigo-500 h-full rounded-full transition-all duration-300"
                          style={{ width: `${((currentQuestionIndex + 1) / totalQuestions) * 100}%` }}
                        />
                      </div>

                      {/* Question Container */}
                      <AnimatePresence mode="wait">
                        {currentQuestion && (
                          <motion.div
                            key={currentQuestion.id}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.25 }}
                            className="space-y-6"
                          >
                            <div className="space-y-2">
                              <div className="flex items-center space-x-2">
                                <span className="text-xs font-mono font-semibold text-emerald-400">
                                  QUESTION {currentQuestionIndex + 1}
                                </span>
                              </div>
                              <h4 className="text-md md:text-lg font-bold text-white leading-snug">
                                {currentQuestion.question}
                              </h4>
                            </div>

                            {/* Multiple Choice Option Buttons */}
                            <div className="grid grid-cols-1 gap-3.5">
                              {currentQuestion.options.map((optionText, oIdx) => {
                                const optionLetter = ["A", "B", "C", "D"][oIdx];
                                const hasUserAnswered = !!selectedAnswers[currentQuestion.id];
                                const isUserChoice = selectedAnswers[currentQuestion.id] === optionLetter;
                                const isCorrectChoice = currentQuestion.correctAnswer === optionLetter;

                                let buttonStyles = "bg-gray-900 border-gray-800 hover:bg-gray-800/60 hover:border-gray-700 text-gray-200";
                                if (hasUserAnswered) {
                                  if (isCorrectChoice) {
                                    buttonStyles = "bg-emerald-500/15 border-emerald-500 text-emerald-300 font-semibold shadow-sm shadow-emerald-950/20";
                                  } else if (isUserChoice) {
                                    buttonStyles = "bg-rose-500/15 border-rose-500 text-rose-300 font-semibold";
                                  } else {
                                    buttonStyles = "bg-gray-900/40 border-gray-800/40 text-gray-500 cursor-not-allowed";
                                  }
                                }

                                return (
                                  <button
                                    key={optionLetter}
                                    onClick={() => handleSelectAnswer(currentQuestion.id, optionLetter)}
                                    disabled={hasUserAnswered}
                                    className={`w-full p-4 rounded-xl border text-left text-xs md:text-sm flex items-center justify-between transition group cursor-pointer ${buttonStyles}`}
                                    style={{ minHeight: "56px" }}
                                  >
                                    <div className="flex items-center space-x-3.5 pr-4">
                                      <span className={`w-6 h-6 flex items-center justify-center rounded-lg text-xs font-mono font-bold border transition ${
                                        isUserChoice 
                                          ? "bg-white text-black border-transparent" 
                                          : hasUserAnswered && isCorrectChoice
                                          ? "bg-emerald-500 text-white border-transparent"
                                          : "bg-gray-800 text-gray-400 border-gray-700 group-hover:text-white"
                                      }`}>
                                        {optionLetter}
                                      </span>
                                      <span className="leading-tight">{optionText}</span>
                                    </div>

                                    {/* Evaluation Icons */}
                                    {hasUserAnswered && (
                                      <span className="flex-shrink-0">
                                        {isCorrectChoice && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                                        {isUserChoice && !isCorrectChoice && <XCircle className="w-5 h-5 text-rose-400" />}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Detailed Explanation revealed upon answering */}
                            <AnimatePresence>
                              {selectedAnswers[currentQuestion.id] && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="overflow-hidden"
                                >
                                  <div className="bg-[#1c2128] rounded-xl p-4 border border-gray-800 mt-4">
                                    <div className="flex items-center space-x-2 text-emerald-400 text-xs font-mono font-semibold mb-2">
                                      <Check className="w-4 h-4" />
                                      <span>Correct Answer: Option {currentQuestion.correctAnswer}</span>
                                    </div>
                                    <p className="text-xs text-gray-300 leading-relaxed font-mono bg-gray-900/50 p-3 rounded-lg border border-gray-800">
                                      {currentQuestion.explanation}
                                    </p>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>

                            {/* Question Nav Controls */}
                            <div className="flex justify-between items-center pt-4 border-t border-gray-800 mt-8">
                              <span className="text-[11px] text-gray-500 font-mono">
                                Total Answers: {Object.keys(selectedAnswers).length} / {totalQuestions}
                              </span>

                              {selectedAnswers[currentQuestion.id] && (
                                <button
                                  onClick={() => {
                                    if (currentQuestionIndex < totalQuestions - 1) {
                                      setCurrentQuestionIndex(prev => prev + 1);
                                    } else {
                                      setShowSummary(true);
                                    }
                                  }}
                                  className="px-4.5 py-2 bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                                >
                                  {currentQuestionIndex < totalQuestions - 1 ? "Next Question" : "View Results"}
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}

                  {/* Final Results & score Summary Card */}
                  {showSummary && quiz && !loading && (
                    <motion.div
                      key="summary"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-[#161b22] border border-gray-800 rounded-3xl p-6 md:p-8 shadow-xl text-center relative overflow-hidden"
                    >
                      <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-emerald-500 to-indigo-500"></div>

                      <div className="w-20 h-20 bg-gradient-to-br from-emerald-500/10 to-indigo-500/10 border border-emerald-500/25 rounded-2xl flex items-center justify-center mx-auto mb-6">
                        <Award className="w-10 h-10 text-emerald-400 animate-bounce" />
                      </div>

                      <h2 className="text-2xl font-bold text-white mb-2">
                        {getScoreVerdict().title}
                      </h2>
                      <p className="text-xs text-gray-400 max-w-md mx-auto leading-relaxed mb-6">
                        {getScoreVerdict().desc}
                      </p>

                      {/* Interactive Score Display */}
                      <div className="inline-grid grid-cols-2 gap-4 p-4 bg-gray-900 rounded-2xl border border-gray-800 mb-8 font-mono">
                        <div className="text-center px-4">
                          <span className="text-[10px] text-gray-500 block uppercase tracking-wider">Correct Answers</span>
                          <span className="text-2xl font-bold text-emerald-400">{totalScore}</span>
                        </div>
                        <div className="text-center px-4 border-l border-gray-800">
                          <span className="text-[10px] text-gray-500 block uppercase tracking-wider">Accuracy Rate</span>
                          <span className="text-2xl font-bold text-indigo-400">
                            {Math.round((totalScore / totalQuestions) * 100)}%
                          </span>
                        </div>
                      </div>

                      {/* Social Media Content Generator Section */}
                      <div className="bg-gray-900/60 border border-gray-800/80 rounded-2xl p-4 text-left max-w-lg mx-auto mb-8">
                        <div className="flex justify-between items-center mb-3">
                          <div className="flex items-center space-x-1.5 text-xs text-indigo-400 font-semibold font-mono">
                            <Share2 className="w-3.5 h-3.5" />
                            <span>Copy Trivia Post to clipboard</span>
                          </div>
                          <button
                            onClick={handleCopySocials}
                            className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border border-gray-700 transition"
                            title="Copy Trivia Output"
                          >
                            {copied ? <span className="text-[10px] text-emerald-400 px-1 font-semibold">Copied!</span> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <textarea
                          readOnly
                          value={generateSocialCopy()}
                          className="w-full h-32 bg-gray-950 border border-gray-800 rounded-xl p-3 text-xs text-gray-300 font-mono leading-relaxed resize-none focus:outline-none custom-scrollbar"
                        />
                      </div>

                      {/* Navigation buttons */}
                      <div className="flex justify-center items-center space-x-4">
                        <button
                          onClick={handleGenerateQuiz}
                          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-md shadow-emerald-950/20 transition cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Play Again
                        </button>
                        <button
                          onClick={() => {
                            setSelectedAnswers({});
                            setCurrentQuestionIndex(0);
                            setShowSummary(false);
                          }}
                          className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold rounded-xl border border-gray-700 transition cursor-pointer"
                        >
                          Review Answers
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
        </div>

        {/* Outer Minimal Footer */}
        <footer className="text-center text-[11px] font-mono text-gray-500 mt-16 pt-6 border-t border-gray-800">
          <p>© 2026 Sports Quiz Generator Agent.</p>
        </footer>

      </div>
    </div>
  );
}
