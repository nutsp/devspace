/** Wiki create/edit follows workspace membership; deletion uses the native Project admin rule. */
export function wikiCollectionPermissions(role?: number) {
  return { canEdit: (role ?? 0) >= 15, canDelete: role === 20 };
}
