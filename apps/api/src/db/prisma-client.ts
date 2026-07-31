// Prisma's generated client lives outside src/ (apps/api/generated/prisma) so Jest coverage,
// the lint glob, prettier's format script, and tsc --noEmit never touch generated code (see
// prisma/schema.prisma's generator block). This one-line barrel lets the rest of the app keep
// importing through the existing @/* tsconfig alias instead of a relative ../../generated path
// scattered across every service.
export * from '../../generated/prisma/client';
