# ScrollUniversity Course Material Completeness Standard

Status: **required gate for launch curricula**

A ScrollUniversity course is not "complete" because a course row, title, syllabus, or AI generator exists. A course is complete only when a student can enrol and complete the intended learning journey using reviewed materials that are mapped to outcomes and assessments.

## Required package for every course

Each launch course MUST contain:

1. Course specification
   - code, title, level, internal workload units, delivery mode and planned learner workload
   - prerequisite/co-requisite information
   - course description and scope
   - measurable learning outcomes
   - assessment strategy and grade weights

2. Structured learning path
   - ordered modules
   - ordered lessons within each module
   - lesson objectives
   - substantive original teaching material or a rights-cleared/open source reading
   - worked example, demonstration or case where appropriate
   - learner activity
   - self-check questions with answers/feedback
   - estimated study time

3. Assessment package
   - formative checks throughout the course
   - at least two summative assessment components for a standard taught course
   - instructions and submission requirements
   - marking rubric / criteria
   - explicit course-outcome mapping

4. Learning resources
   - required and supplementary reading/resource list
   - verified bibliographic or authoritative-source metadata
   - license/provenance for externally hosted resources
   - no fabricated citations
   - no copyrighted text copied into ScrollUniversity without permission

5. Inclusion and accessibility
   - plain-text equivalent for essential visual information
   - transcript/caption requirement for audio/video
   - keyboard-accessible and screen-reader-compatible learning activities
   - alternatives for activities that require unavailable proprietary software where feasible

6. Quality assurance
   - subject accuracy review
   - citation/source review
   - pedagogy review
   - assessment/outcome alignment review
   - accessibility review
   - copyright/license review
   - version and review date

## Workload-unit rule

ScrollUniversity does **not** award ECTS, transferable academic credit, degrees or professional licensure through this curriculum. Numeric `credits` stored in the current internal academic schema are **ScrollUniversity workload-planning units only** unless and until a duly authorized institution formally awards and recognizes credit under its own rules.

For workload planning, ScrollUniversity uses the European Commission ECTS workload convention as a benchmark: approximately 25–30 learner hours per workload unit. This is a workload-design reference, not a representation that ScrollUniversity units are ECTS.

A 5-unit ScrollUniversity course therefore plans approximately **125–150 total learner hours**, including guided study, readings, practice, assessment preparation and independent work. The Foundation Core uses 135 hours per course, or 810 planned learner hours across six courses. The repository validator checks consistency with the 25–30-hour benchmark.

Reference: European Commission, *ECTS Users' Guide 2015*.
https://education.ec.europa.eu/document/ects-users-guide-2015

## Foundation curriculum reference frameworks

The ScrollUniversity Foundation Core is informed by, but does not copy, these frameworks:

- Association of College and Research Libraries (ACRL), *Framework for Information Literacy for Higher Education*.
  https://www.ala.org/acrl/standards/ilframework
- European Commission Joint Research Centre, *DigComp 3.0 / Digital Competence Framework* and predecessor DigComp 2.2.
  https://joint-research-centre.ec.europa.eu/projects-and-activities/education-and-training/digital-transformation-education/digital-competence-framework-digcomp_en
- UNESCO, *AI Competency Framework for Students* (2024, updated 2026).
  https://www.unesco.org/en/articles/ai-competency-framework-students
- NIST, *Cybersecurity Framework 2.0* (2024).
  https://www.nist.gov/cyberframework
- NIST, *Artificial Intelligence Risk Management Framework 1.0* and GenAI Profile.
  https://www.nist.gov/itl/ai-risk-management-framework
- European Commission Joint Research Centre, *EntreComp: The Entrepreneurship Competence Framework*.
  https://joint-research-centre.ec.europa.eu/scientific-activities/key-competences-lifelong-learning/entrecomp-entrepreneurship-competence-framework_en

These sources are used as competency references. ScrollUniversity course prose, exercises, assessments and examples must remain original unless a source's license explicitly permits reuse and attribution requirements are met.

## Launch-pack validation rules

A launch course pack must pass automated validation before it may be marked `release_candidate`:

- internal workload units > 0
- planned workload between workload units × 25 and workload units × 30 hours
- at least 4 measurable learning outcomes
- at least 5 modules
- at least 2 lessons per module
- every lesson has objectives, teaching material, activity and self-check
- at least 2 summative assessments
- assessment weights total 100%
- every learning outcome is assessed
- each summative assessment maps to at least one course outcome
- at least 5 verified references/resources
- explicit provenance/license field for each external resource
- explicit workload decomposition and substantial practice plan
- named QA status fields are present

Passing structural validation does **not** substitute for human/subject review. The final publication state remains controlled by academic QA.