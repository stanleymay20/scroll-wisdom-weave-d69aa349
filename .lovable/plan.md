
# 🧠 Enterprise-Grade Cognitive Learning System Upgrade

## Phase 1: Smarter Adaptive Learning Paths
1. **Upgrade `adaptiveLearningEngine.ts`** — Add predictive mastery scoring using exponential weighted moving average (EWMA) across quiz scores, reading time, and reflection quality
2. **Smart chapter sequencing** — When a learner struggles (score < 60%), auto-suggest prerequisite chapters from the Knowledge Graph before advancing
3. **Pace calibration** — Dynamically adjust quiz difficulty ramp speed based on learner's rolling 5-attempt window instead of fixed thresholds
4. **Spaced repetition integration** — Surface "due for review" cards inline in the reader at natural break points, not just in a separate tab

## Phase 2: Richer Interactive Exercises  
5. **Scenario-based exercises** — New exercise type in Quiz Mode: present a real-world scenario, require multi-step analysis with Bloom's Apply/Analyze targeting
6. **Concept matching** — Drag-and-drop style matching exercise (concept → definition → example) rendered as interactive cards
7. **Visual knowledge checks** — For illustrated/STEM books: present a diagram and ask learners to identify/label components
8. **Code sandbox upgrades** — Add test-case validation with visible pass/fail indicators and hints on failure

## Phase 3: Better Progress Visualization
9. **Mastery heat map** — Visual chapter-by-chapter heat map showing mastery levels (red → yellow → green) on book detail page
10. **Knowledge gap radar** — Enhanced radar chart showing Bloom's taxonomy gaps with actionable "Focus on X" recommendations
11. **Learning velocity tracker** — Show chapters/week trend, predicted completion date, and comparison to personal best
12. **Streak & momentum widgets** — Gamified streak display with milestone badges on the dashboard

## Phase 4: Deeper AI Tutoring
13. **Socratic questioning mode** — Upgrade InteractiveQA to detect when learner is stuck and switch to guided questioning instead of direct answers
14. **Misconception repair** — When quiz answers reveal misconceptions (from `learner_concept_states`), AI proactively addresses them in the next Ask AI interaction
15. **Contextual study recommendations** — After each quiz, AI generates a personalized 3-point study plan based on weak areas from the Knowledge Graph

**Estimated scope**: ~8 files modified, ~3 new components created
