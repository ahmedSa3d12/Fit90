export function memberPrimarySaveAction(editId: number | null): 'save-changes' | 'save-and-add-subscription' {
  return editId === null ? 'save-and-add-subscription' : 'save-changes';
}
