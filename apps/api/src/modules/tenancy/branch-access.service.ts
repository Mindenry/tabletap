import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Branch } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { StaffPrincipal } from '../auth/principal';

/**
 * Every branch-scoped read and write goes through this service. It never trusts
 * a client-supplied branch id: the branch must belong to the caller's tenant and
 * be inside the caller's branch scope. An empty scope means "all branches".
 */
@Injectable()
export class BranchAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async load(principal: StaffPrincipal, branchId: string): Promise<Branch> {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch || branch.tenantId !== principal.tenantId) {
      throw new NotFoundException({ message: 'Branch not found', code: 'BRANCH_NOT_FOUND' });
    }
    if (principal.branchIds.length > 0 && !principal.branchIds.includes(branchId)) {
      throw new ForbiddenException({
        message: 'You do not have access to this branch',
        code: 'BRANCH_FORBIDDEN',
      });
    }
    return branch;
  }

  /** Resolves the default branch for endpoints that allow an optional branchId. */
  async resolve(principal: StaffPrincipal, branchId?: string): Promise<Branch> {
    if (branchId) return this.load(principal, branchId);
    if (principal.branchIds.length > 0) {
      return this.load(principal, principal.branchIds[0]!);
    }
    const first = await this.prisma.branch.findFirst({
      where: { tenantId: principal.tenantId, status: { not: 'ARCHIVED' } },
      orderBy: { createdAt: 'asc' },
    });
    if (!first) {
      throw new NotFoundException({ message: 'No branch configured', code: 'NO_BRANCH' });
    }
    return first;
  }

  /** Branch ids the caller may read, for building `where` clauses. */
  async allowedBranchIds(principal: StaffPrincipal): Promise<string[]> {
    if (principal.branchIds.length > 0) return principal.branchIds;
    const branches = await this.prisma.branch.findMany({
      where: { tenantId: principal.tenantId, status: { not: 'ARCHIVED' } },
      select: { id: true },
    });
    return branches.map((b) => b.id);
  }

  /** Prisma filter that restricts a query to the caller's branch scope. */
  async branchFilter(principal: StaffPrincipal, requested?: string): Promise<{ branchId: string }> {
    const branch = await this.resolve(principal, requested);
    return { branchId: branch.id };
  }
}
