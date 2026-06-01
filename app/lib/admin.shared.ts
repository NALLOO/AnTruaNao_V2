export type PublicAdminSummary = {
  slug: string;
  displayName: string | null;
  userName: string;
  bankConfigured: boolean;
};

export type AdminBankConfig = {
  bankCode: string;
  accountNumber: string;
  accountHolderName: string;
};

export type AdminProfileFields = {
  bankCode: string | null;
  accountNumber: string | null;
  accountHolderName: string | null;
};

export function getAdminBankConfig(
  admin: AdminProfileFields
): AdminBankConfig | null {
  if (
    !admin.bankCode?.trim() ||
    !admin.accountNumber?.trim() ||
    !admin.accountHolderName?.trim()
  ) {
    return null;
  }
  return {
    bankCode: admin.bankCode.trim(),
    accountNumber: admin.accountNumber.trim(),
    accountHolderName: admin.accountHolderName.trim(),
  };
}

export function isAdminBankConfigured(admin: AdminProfileFields): boolean {
  return getAdminBankConfig(admin) !== null;
}

export function boardUrlForAdmin(slug: string, weekId?: string): string {
  const params = new URLSearchParams({ admin: slug });
  if (weekId) params.set("weekId", weekId);
  return `/?${params.toString()}`;
}

export function paymentUrlForAdmin(slug: string, userId?: string): string {
  const params = new URLSearchParams({ admin: slug });
  if (userId) params.set("userId", userId);
  return `/payment?${params.toString()}`;
}

export function weekWhereForAdmin(adminId: string) {
  return { adminId };
}
