import {
  createTimelineOptionGroup,
  type TimelineGroup,
  getRecordFieldIds,
  getTimelineRowTargetEntity,
  resolveEntityFieldSource,
  resolveEntityListFieldOptions,
  getEntityRelationTargetId,
  type Entity,
  type EntityTimelineSetup,
  type EntityValueContext,
} from "@/entities/entity";
import type { PaymentRow, UnallocatedReceipt } from "../model/types";

type Payments = {
  rows: PaymentRow[];
  factRows: PaymentRow[];
  unallocated: UnallocatedReceipt[];
};

export function groupCalendarPlans(
  ctx: EntityValueContext,
  dds: Entity,
  article: Entity | null,
  setup: EntityTimelineSetup | null,
  ddsGroups: readonly TimelineGroup[],
  rows: readonly PaymentRow[],
  factRows: readonly PaymentRow[],
  unallocated: readonly UnallocatedReceipt[],
) {
  const groups = ddsGroups.map((group) => ({
    ...group,
    children: [...group.children],
  }));
  const byGroup = new Map<string, Payments>();
  const fallback: Payments = { rows: [], factRows: [], unallocated: [] };
  const groupField = setup?.groupField;
  const activity = article?.fields.find(
    (field) => field.id === setup?.clusterFieldId,
  );
  const movement = article?.fields.find(
    (field) => field.id === setup?.splitFieldId,
  );
  if (
    !article ||
    !groupField ||
    !activity ||
    !movement ||
    getTimelineRowTargetEntity(dds, groupField, ctx.entities)?.id !== article.id
  ) {
    return { groups, byGroup, fallback: { rows, factRows, unallocated } };
  }

  const isIncome = (label: string) =>
    /^(поступлени[ея]|приход|доходы?)$/iu.test(label.trim());
  const movementSource = resolveEntityFieldSource(
    article,
    movement,
    ctx.entities,
  )?.field;
  const incomeOptions = movementSource
    ? resolveEntityListFieldOptions(movementSource, ctx.entities).filter(
        (option) => isIncome(option.name),
      )
    : [];
  const activitySource = resolveEntityFieldSource(
    article,
    activity,
    ctx.entities,
  )?.field;
  const activityOptions = new Set(
    activitySource &&
      resolveEntityListFieldOptions(activitySource, ctx.entities).map(
        (option) => option.id,
      ),
  );
  const activityTarget =
    activitySource && getEntityRelationTargetId(activitySource);
  const ensureBranch = (activityId: string, movementId: string) => {
    let parent = groups.find(
      (group) => group.kind === "cluster" && group.optionId === activityId,
    );
    parent ??= createTimelineOptionGroup(
      ctx,
      article,
      activity,
      "cluster",
      activityId,
      "",
      0,
    );
    let income = parent.children.find(
      (group) => group.kind === "split" && group.optionId === movementId,
    );
    income ??= createTimelineOptionGroup(
      ctx,
      article,
      movement,
      "split",
      movementId,
      parent.key + "/",
      1,
    );
    if (!isIncome(income.label)) return fallback;
    if (!groups.includes(parent)) groups.push(parent);
    if (!parent.children.includes(income)) parent.children.push(income);
    const payments = byGroup.get(income.key) ?? {
      rows: [],
      factRows: [],
      unallocated: [],
    };
    byGroup.set(income.key, payments);
    return payments;
  };
  const byArticle = new Map<string, Payments>();
  const articleBranch = (id: string) => {
    const cached = byArticle.get(id);
    if (cached) return cached;
    const record = ctx.getRecord(article.id, id);
    if (!record) return fallback;
    const activities = getRecordFieldIds(ctx, article, record, activity);
    const movements = getRecordFieldIds(ctx, article, record, movement);
    const result =
      activities.length === 1 && movements.length === 1
        ? ensureBranch(activities[0]!, movements[0]!)
        : fallback;
    byArticle.set(id, result);
    return result;
  };

  const receiptBranch = (receiptId: string) => {
    const record = ctx.getRecord(dds.id, receiptId);
    const ids = record ? getRecordFieldIds(ctx, dds, record, groupField) : [];
    return ids.length === 1 ? articleBranch(ids[0]!) : fallback;
  };

  for (const row of rows) {
    const { articleId, activityId } = row.stage;
    let target = fallback;
    if (articleId) target = articleBranch(articleId);
    else if (
      activityId &&
      incomeOptions.length === 1 &&
      (activityOptions.has(activityId) ||
        (activityTarget && ctx.getRecord(activityTarget, activityId)))
    ) {
      target = ensureBranch(activityId, incomeOptions[0]!.id);
    }
    target.rows.push(row);
  }
  for (const row of factRows) {
    const sharesByBranch = new Map<Payments, PaymentRow["receipts"]>();
    for (const share of row.receipts) {
      const branch = receiptBranch(share.receiptId);
      const shares = sharesByBranch.get(branch) ?? [];
      shares.push(share);
      sharesByBranch.set(branch, shares);
    }
    for (const [branch, receipts] of sharesByBranch) {
      branch.factRows.push({ ...row, receipts });
    }
  }
  for (const item of unallocated) {
    receiptBranch(item.receipt.id).unallocated.push(item);
  }
  return { groups, byGroup, fallback };
}
