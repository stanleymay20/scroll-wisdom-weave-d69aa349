-- Keep public FAQ claims aligned with the current GA/PMF surface.
-- Advanced authoring, exports, paid checkout, and external publishing remain
-- fail-closed until their validation gates are deliberately opened.

update public.faqs
set answer = 'ScrollLibrary is an AI-native book creation and reading platform. In the current GA scope, you can create structured books, keep them in your library, read them, and use learning and assessment tools. Advanced authoring and publishing capabilities remain gated until their GA validation checks pass.'
where id = '79ad269c-ae44-44b3-aa86-b0bee774c460';

update public.faqs
set answer = 'ScrollLibrary uses a structured AI book-generation workflow to turn your topic and configuration into a multi-chapter book project. The current GA experience prioritizes reliable book creation, reading, and learning; specialized authoring modes remain hidden until they pass provider qualification.'
where id = '8e02114b-0d63-4a8c-92e8-69e5ac6bd09c';

update public.faqs
set answer = 'Advanced book exports are still under GA validation and are not enabled in the current PMF launch scope. ScrollLibrary will expose validated export formats only after their release gates pass.'
where id = '3ba89a10-f4e1-4f77-9865-cb977a879641';

update public.faqs
set answer = 'You retain rights in the content you create, subject to applicable law and any rights in source material you provide or use. During GA validation, eligible books can be listed free on the ScrollLibrary storefront; paid checkout and external publishing remain gated until their validation checks pass.'
where id = 'aecf4710-7f60-4e30-bdc8-ab0435b561cc';

update public.faqs
set answer = 'Generation time varies with book length, configuration, provider response time, and system load. ScrollLibrary shows generation progress in the product rather than promising a fixed completion time.'
where id = 'd6b7ad38-63d3-40a2-9b8a-2863646af834';

update public.faqs
set answer = 'Your books are stored in your account library and access is controlled by the platform''s authentication and row-level security rules. Content is not made public unless a publishing or listing action explicitly does so.'
where id = '57abd94d-ed0e-492c-84fe-f2f9e0fd329c';
