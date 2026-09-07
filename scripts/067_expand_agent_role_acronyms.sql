-- Replace stored specialist acronyms with full terms.

UPDATE public.agents
SET role = 'Environmental effects alignment',
    updated_at = now()
WHERE role = 'OER alignment';

UPDATE public.agents
SET role = 'Programme quality control',
    updated_at = now()
WHERE role = 'Programme QC';

UPDATE public.agent_versions
SET instructions = replace(instructions, 'OER RULES:', 'ENVIRONMENTAL EFFECTS RULES:')
WHERE instructions LIKE 'OER RULES:%';
