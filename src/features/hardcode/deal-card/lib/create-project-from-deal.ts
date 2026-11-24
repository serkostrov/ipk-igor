import {
  addEntityRecord,
  isEntityNameField,
  parseEntityRelationIds,
  serializeEntityRelationIds,
  updateEntityRecord,
  type EntityRecord,
  type EntityValueContext,
} from "@/entities/entity";
import { findNamedField, findRelationTo, type DealCardSources } from "../match";
import type { DealCardData } from "../model/deal-data";

/**
 * Creates a project prefilled from the deal, then links the deal's contract
 * stages (and contract) that have no project yet. Each write goes to the DB
 * first (store contract). Returns the new project id and linked stage count.
 */
export async function createProjectFromDeal(input: {
  ctx: EntityValueContext;
  sources: DealCardSources;
  dealRecord: EntityRecord;
  dealTitle: string;
  data: DealCardData;
}): Promise<{ projectId: string; linkedStages: number }> {
  const { ctx, sources, data } = input;
  const project = sources.project;
  if (!project) throw new Error("Сущность «Проекты» не найдена");

  const values: Record<string, string> = {};
  const setRelation = (fieldId: string | undefined, id: string | null) => {
    if (fieldId && id) values[fieldId] = serializeEntityRelationIds([id]);
  };
  const nameField = project.fields.find((field) => isEntityNameField(field));
  if (nameField) values[nameField.id] = input.dealTitle;
  setRelation(
    findRelationTo(project, sources.deal, ["Сделка"])?.id,
    input.dealRecord.id,
  );
  setRelation(
    findRelationTo(project, sources.contract, ["Договор"])?.id,
    data.contracts[0]?.id ?? null,
  );
  const relation = (names: readonly string[]) =>
    findNamedField(project, names, ["relation"])?.id;
  setRelation(relation(["Лид"]), data.deal.leadId);
  setRelation(relation(["Контрагент"]), data.deal.counterpartyId);
  setRelation(relation(["Менеджер"]), data.deal.managerId);
  setRelation(relation(["ГИП"]), data.deal.gipId);

  const created = await addEntityRecord(project.id, values);
  const projectValue = serializeEntityRelationIds([created.id]);

  let linkedStages = 0;
  const stageProject = findRelationTo(sources.stage, project, ["Проект"]);
  if (sources.stage && stageProject) {
    for (const stage of data.stages) {
      const record = ctx.getRecord(sources.stage.id, stage.id);
      if (!record) continue;
      if (parseEntityRelationIds(record.values[stageProject.id]).length > 0) {
        continue;
      }
      await updateEntityRecord(sources.stage.id, stage.id, {
        [stageProject.id]: projectValue,
      });
      linkedStages += 1;
    }
  }

  const contractProject = findRelationTo(sources.contract, project, ["Проект"]);
  if (sources.contract && contractProject) {
    for (const contract of data.contracts) {
      const record = ctx.getRecord(sources.contract.id, contract.id);
      if (
        !record ||
        parseEntityRelationIds(record.values[contractProject.id]).length > 0
      ) {
        continue;
      }
      await updateEntityRecord(sources.contract.id, contract.id, {
        [contractProject.id]: projectValue,
      });
    }
  }

  return { projectId: created.id, linkedStages };
}
