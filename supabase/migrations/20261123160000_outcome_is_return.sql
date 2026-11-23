-- Mark return / reject outcome buttons with isReturn so «Причина возврата»
-- and keepFilledData only apply to those buttons.

do $$
declare
  tmpl record;
  outcomes jsonb;
  outcome jsonb;
  next_outcomes jsonb;
  label text;
  i int;
begin
  for tmpl in
    select id, outcomes
    from public.automation_task_templates
    where id in (
      'atpl-tkp-approve-gip',
      'atpl-tkp-approve-rko',
      'atpl-tkp-approve-gd',
      'atpl-tkp-chief-approve',
      'atpl-lead-chief-decision'
    )
  loop
    next_outcomes := '[]'::jsonb;
    for i in 0 .. greatest(jsonb_array_length(coalesce(tmpl.outcomes, '[]'::jsonb)) - 1, -1)
    loop
      outcome := tmpl.outcomes->i;
      label := lower(replace(coalesce(outcome->>'label', ''), 'ё', 'е'));

      if label in ('вернуть менеджеру', 'не согласовано', 'не берем в работу') then
        outcome := outcome || jsonb_build_object(
          'isReturn', true,
          'keepFilledData', coalesce((outcome->>'keepFilledData')::boolean, true)
        );
      else
        outcome := outcome || jsonb_build_object(
          'isReturn', false,
          'keepFilledData', true
        );
      end if;

      next_outcomes := next_outcomes || jsonb_build_array(outcome);
    end loop;

    update public.automation_task_templates
    set outcomes = next_outcomes, updated_at = now()
    where id = tmpl.id;
  end loop;
end;
$$;
