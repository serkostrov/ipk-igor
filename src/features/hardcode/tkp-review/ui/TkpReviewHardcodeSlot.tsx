/**
 * Entrypoint for TKP GIP cost + commercial pricing on record page and tasks.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useCurrentRole } from "@/entities/access";
import {
  collectRecordsLinkedToParent,
  resolveHostChildParentLinkField,
} from "@/entities/automation";
import {
  getSystemUserName,
  updateEntityRecord,
  useCurrentUserRecordId,
  useEntityConfig,
  useEntityValueContext,
  type Entity,
  type EntityRecord,
} from "@/entities/entity";
import {
  adaptDeptRecordsToGipDepartments,
  adaptSubcontractorRecords,
  adaptTripRecords,
} from "../../tkp-gip-cost/model/adapt-departments";
import {
  calculateReviewCostBreakdown,
  type ReviewGipCostCalculation,
} from "../../tkp-gip-cost/model/gip-cost";
import { GipCostSummary } from "../../tkp-gip-cost/ui/GipCostSummary";
import {
  appendTkpPriceRevision,
  fetchTkpPriceRevisions,
} from "../../tkp-commercial/api/price-revisions-api";
import type { TkpPriceRevisionSummary } from "../../tkp-commercial/model/types";
import {
  CommercialPricingPanel,
  type CommercialPricingPanelSaveInput,
} from "../../tkp-commercial/ui/CommercialPricingPanel";
import {
  findDeptCalculationsLinkedEntity,
  findSubcontractorsLinkedEntity,
  findTripsLinkedEntity,
  readTkpGipExecutionDurationDays,
  resolveTkpRelatedMoneyFields,
  writeTkpGipExecutionDurationPatch,
} from "../model/match-related";
import { resolveTkpReviewCostVisibility } from "../model/visibility";
import {
  BIND_PRICE_REVISION_KEY,
  PENDING_NEW_PRICE_KEY,
} from "../lib/tkp-file-bind";
import { TkpRelatedMoneyTable } from "./TkpRelatedMoneyTable";
import { TkpPendingPriceVersionBanner } from "./TkpPendingPriceVersionBanner";

export type TkpReviewHardcodeSection = "gip" | "commercial" | "related";

const ALL_TKP_REVIEW_SECTIONS: readonly TkpReviewHardcodeSection[] = [
  "gip",
  "commercial",
  "related",
];

export function TkpReviewHardcodeSlot({
  entity,
  record,
  readOnly = false,
  showRelatedTables = true,
  /** Which blocks to render (GIP summary can live on the dept-calculations tab). */
  sections = ALL_TKP_REVIEW_SECTIONS,
}: {
  entity: Entity;
  record: EntityRecord;
  readOnly?: boolean;
  showRelatedTables?: boolean;
  sections?: readonly TkpReviewHardcodeSection[];
}) {
  const role = useCurrentRole();
  const visibility = useMemo(
    () => resolveTkpReviewCostVisibility(role),
    [role],
  );
  const { entities } = useEntityConfig();
  const ctx = useEntityValueContext();
  const currentUserId = useCurrentUserRecordId();
  const [history, setHistory] = useState<TkpPriceRevisionSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const deptEntity = useMemo(
    () => findDeptCalculationsLinkedEntity(entity, entities),
    [entity, entities],
  );
  const tripsEntity = useMemo(
    () => findTripsLinkedEntity(entity, entities),
    [entity, entities],
  );
  const subsEntity = useMemo(
    () => findSubcontractorsLinkedEntity(entity, entities),
    [entity, entities],
  );

  const deptRecords = useMemo(() => {
    if (!deptEntity) return [];
    const ids = collectRecordsLinkedToParent({
      childEntity: deptEntity,
      parentEntityId: entity.id,
      parentRecordId: record.id,
      host: entity,
    });
    const idSet = new Set(ids);
    return deptEntity.records.filter((item) => idSet.has(item.id));
  }, [deptEntity, entity, record.id]);

  const tripRecords = useMemo(() => {
    if (!tripsEntity) return [];
    const ids = collectRecordsLinkedToParent({
      childEntity: tripsEntity,
      parentEntityId: entity.id,
      parentRecordId: record.id,
      host: entity,
    });
    const idSet = new Set(ids);
    return tripsEntity.records.filter((item) => idSet.has(item.id));
  }, [tripsEntity, entity, record.id]);

  const subRecords = useMemo(() => {
    if (!subsEntity) return [];
    const ids = collectRecordsLinkedToParent({
      childEntity: subsEntity,
      parentEntityId: entity.id,
      parentRecordId: record.id,
      host: entity,
    });
    const idSet = new Set(ids);
    return subsEntity.records.filter((item) => idSet.has(item.id));
  }, [subsEntity, entity, record.id]);

  const gipBreakdown = useMemo(() => {
    if (!deptEntity) {
      return calculateReviewCostBreakdown({ departments: [] });
    }
    const departments = adaptDeptRecordsToGipDepartments({
      ctx,
      hostEntity: deptEntity,
      records: deptRecords,
      entities,
    });
    const tripFields = tripsEntity
      ? resolveTkpRelatedMoneyFields(tripsEntity)
      : null;
    const subFields = subsEntity
      ? resolveTkpRelatedMoneyFields(subsEntity)
      : null;
    const trips = tripsEntity
      ? adaptTripRecords({
          ctx,
          entity: tripsEntity,
          records: tripRecords,
          amountFieldId: tripFields?.amount?.id ?? null,
          titleFieldId: tripFields?.title?.id ?? null,
        })
      : [];
    const subcontractors = subsEntity
      ? adaptSubcontractorRecords({
          ctx,
          entity: subsEntity,
          records: subRecords,
          amountFieldId: subFields?.amount?.id ?? null,
          titleFieldId: subFields?.title?.id ?? null,
          counterpartyFieldId: subFields?.counterparty?.id ?? null,
        })
      : [];
    return calculateReviewCostBreakdown({
      departments,
      trips,
      subcontractors,
    });
  }, [
    ctx,
    deptEntity,
    deptRecords,
    entities,
    tripsEntity,
    tripRecords,
    subsEntity,
    subRecords,
  ]);

  const gipCalculation =
    gipBreakdown.gipCalculation as ReviewGipCostCalculation;
  const commercialBasis =
    gipCalculation.calculationVersion === 2 ||
    gipCalculation.calculationVersion === 3
      ? gipCalculation.commercialBasis
      : {
          costWithFixed: gipCalculation.costWithFixed,
          contractorWorkTotal: gipCalculation.contractorWorkTotal ?? 0,
          additionalWorkTotal: gipCalculation.additionalWorkTotal ?? 0,
          contractorWorkBase: gipCalculation.contractorTotal,
          additionalWorkBase: 0,
        };

  const executionDurationDays = readTkpGipExecutionDurationDays(
    record.values,
    entity,
  );
  const pendingNewPriceVersion = record.values[PENDING_NEW_PRICE_KEY] === "1";

  const reloadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const rows = await fetchTkpPriceRevisions(entity.id, record.id);
      setHistory(rows);
    } catch (error) {
      console.error("[tkp-price-revisions] load failed", error);
    } finally {
      setHistoryLoading(false);
    }
  }, [entity.id, record.id]);

  useEffect(() => {
    if (!visibility.showCommercialPricing) return;
    // Defer so we don't call setState synchronously in the effect body.
    const timer = window.setTimeout(() => {
      void reloadHistory();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reloadHistory, visibility.showCommercialPricing]);

  const tripsLinkFieldId = tripsEntity
    ? (resolveHostChildParentLinkField(entity, tripsEntity)?.field.id ?? null)
    : null;
  const subsLinkFieldId = subsEntity
    ? (resolveHostChildParentLinkField(entity, subsEntity)?.field.id ?? null)
    : null;

  async function handleSaveDuration(days: number) {
    const patch = writeTkpGipExecutionDurationPatch(entity, days);
    updateEntityRecord(entity.id, record.id, {
      ...record.values,
      ...patch,
    });
  }

  async function handleSaveRevision(input: CommercialPricingPanelSaveInput) {
    const authorName = currentUserId
      ? (getSystemUserName(entities, currentUserId) ?? null)
      : null;
    const saved = await appendTkpPriceRevision({
      entityId: entity.id,
      recordId: record.id,
      priceMode: input.mode,
      saleCoefficient:
        input.mode === "coefficient" ? input.saleCoefficient : null,
      manualTotalBeforeVat:
        input.mode === "manual" ? input.manualTotalBeforeVat : null,
      retroAmount: input.retroAmount ?? 0,
      calculation: input.calculation,
      gipCalculation,
      createdByName: authorName,
      idempotencyKey: crypto.randomUUID(),
    });
    const nextValues = { ...record.values };
    if (pendingNewPriceVersion) {
      nextValues[PENDING_NEW_PRICE_KEY] = "1";
      nextValues[BIND_PRICE_REVISION_KEY] = saved.id;
    }
    updateEntityRecord(entity.id, record.id, nextValues);
    toast.success(
      pendingNewPriceVersion
        ? "Версия цены сохранена — загрузите файл ТКП"
        : "Версия цены сохранена",
    );
    await reloadHistory();
  }

  async function handleStartNewPriceVersion() {
    updateEntityRecord(entity.id, record.id, {
      ...record.values,
      [PENDING_NEW_PRICE_KEY]: "1",
    });
    toast.message("Загрузите новый файл ТКП и сохраните версию цены");
  }

  const wantGip = sections.includes("gip");
  const wantCommercial = sections.includes("commercial");
  const wantRelated = sections.includes("related") && showRelatedTables;

  const showGipBlock =
    wantGip &&
    (visibility.showGipCalculation ||
      visibility.showDepartmentRestrictedTotals);
  const showCommercialBlock =
    wantCommercial && visibility.showCommercialPricing;

  const canEditCommercial = !readOnly && showCommercialBlock;
  const canEditGipDuration =
    !readOnly &&
    (visibility.showGipCalculation || visibility.showCommercialPricing);

  if (!showGipBlock && !showCommercialBlock && !wantRelated) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4" data-testid="tkp-review-hardcode-slot">
      {showGipBlock ? (
        <GipCostSummary
          calculation={gipCalculation}
          executionDurationDays={executionDurationDays}
          canEditExecutionDuration={canEditGipDuration}
          onSaveExecutionDuration={
            canEditGipDuration ? handleSaveDuration : undefined
          }
        />
      ) : null}

      {showCommercialBlock ? (
        <div className="space-y-3">
          {pendingNewPriceVersion ? (
            <TkpPendingPriceVersionBanner
              latestRevisionId={history[0]?.id ?? null}
            />
          ) : null}
          <CommercialPricingPanel
            key={history[0]?.id ?? "draft"}
            basis={commercialBasis}
            canEdit={canEditCommercial}
            latestRevision={history[0] ?? null}
            history={history}
            onSaveRevision={handleSaveRevision}
            onStartNewPriceVersion={
              canEditCommercial ? handleStartNewPriceVersion : undefined
            }
            pendingNewPriceVersion={pendingNewPriceVersion}
          />
          {historyLoading ? (
            <p className="text-xs text-muted-foreground">
              Загрузка истории цен…
            </p>
          ) : null}
        </div>
      ) : null}

      {wantRelated ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <TkpRelatedMoneyTable
            title="Командировки"
            emptyText="Командировки не добавлены."
            entity={tripsEntity}
            records={tripRecords}
            parentRecordId={record.id}
            parentLinkFieldId={tripsLinkFieldId}
            readOnly={readOnly}
          />
          <TkpRelatedMoneyTable
            title="Подрядчики"
            emptyText="Подрядные работы не добавлены."
            entity={subsEntity}
            records={subRecords}
            parentRecordId={record.id}
            parentLinkFieldId={subsLinkFieldId}
            readOnly={readOnly}
          />
        </div>
      ) : null}
    </div>
  );
}
