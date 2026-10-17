export function automationStageMapLinkKey(
  fromOptionId: string,
  toOptionId: string,
) {
  return `map:${fromOptionId}\0${toOptionId}`;
}

export function stageElseLinkKey(
  fromOptionId: string,
  elseOptionId: string,
  toOptionId: string,
) {
  return `else:${fromOptionId}\0${elseOptionId}\0${toOptionId}`;
}
