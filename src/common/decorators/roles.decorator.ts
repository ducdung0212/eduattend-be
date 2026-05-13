import { SetMetadata } from '@nestjs/common';

// Gắn metadata 'roles' vào API
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);