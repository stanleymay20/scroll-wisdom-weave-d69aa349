-- Keep public FAQ claims aligned with the current GA/PMF surface.
-- Advanced authoring, exports, paid checkout, and external publishing remain
-- fail-closed until their validation gates are deliberately opened.

update public.faqs
set answer = 'ScrollLibrary is an AI-native book creation and reading platform. In the current GA scope, you can create structured books, keep them in your library, read them, and use learning and assessment tools. Advanced authoring and publishing capabilities remain gated until their GA validation checks pass.'
where question = 'What is ScrollLibrary?';

update public.faqs
set answer = 'ScrollLibrary uses a structured AI book-generation workflow to turn your topic and configuration into a multi-chapter book project. The current GA experience prioritizes reliable book creation, reading, and learning; specialized authoring modes remain hidden until they pass provider qualification.'
where question = 'How does AI book generation work?';

update public.faqs
set answer = 'Advanced book exports are still under GA validation and are not enabled in the current PMF launch scope. ScrollLibrary will expose validated export formats only after their release gates pass.'
where question = 'What export formats are available?';

update public.faqs
set answer = 'You retain rights in the content you create, subject to applicable law and any rights in source material you provide or use. During GA validation, eligible books can be listed free on the ScrollLibrary storefront; paid checkout and external publishing remain gated until their validation checks pass.'
where question = 'Can I sell books generated on ScrollLibrary?';

update public.faqs
set answer = 'Generation time varies with book length, configuration, provider response time, and system load. ScrollLibrary shows generation progress in the product rather than promising a fixed completion time.'
where question = 'How long does it take to generate a book?';

update public.faqs
set answer = 'Your books are stored in your account library and access is controlled by the platform''s authentication and row-level security rules. Content is not made public unless a publishing or listing action explicitly does so.'
where question = 'Is my content secure?';
