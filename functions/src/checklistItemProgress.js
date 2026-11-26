/** Tasks and inventory use the same answered state in the checklist and agenda. */
export function checklistItemProgress(definition, draft) {
  const tasks = definition.sections.flatMap(section => section.items);
  const inventory = definition.inventoryItems ?? [];
  const answered = (item, answers) => (answers?.[item.id] || "UNANSWERED") !== "UNANSWERED";
  return {
    totalItems: tasks.length + inventory.length,
    answeredItems: tasks.filter(item => answered(item, draft?.checklistAnswers)).length
      + inventory.filter(item => answered(item, draft?.inventoryAnswers)).length,
  };
}
