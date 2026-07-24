# โครงสร้างโปรเจกต์ (Directory Tree)

```

.
|-- src
|   |-- common
|   |   |-- decorators
|   |   |   |-- current-user.decorator.ts
|   |   |   |-- permissions.decorator.ts
|   |   |   `-- public.decorator.ts
|   |   |-- entities
|   |   |   `-- base.entity.ts
|   |   |-- enums
|   |   |   `-- index.ts
|   |   |-- filters
|   |   |   `-- http-exception.filter.ts
|   |   |-- guards
|   |   |   |-- jwt-auth.guard.ts
|   |   |   `-- permissions.guard.ts
|   |   |-- interceptors
|   |   `-- pipes
|   |-- config
|   |   `-- typeorm.config.ts
|   |-- database
|   |   |-- migrations
|   |   |   `-- 1784820834266-InitSchema.ts
|   |   `-- seeds
|   |       `-- run-seed.ts
|   |-- modules
|   |   |-- asset-categories
|   |   |   |-- dto
|   |   |   |   |-- create-asset-category.dto.ts
|   |   |   |   `-- update-asset-category.dto.ts
|   |   |   |-- entities
|   |   |   |   `-- asset-category.entity.ts
|   |   |   |-- asset-categories.controller.ts
|   |   |   |-- asset-categories.module.ts
|   |   |   `-- asset-categories.service.ts
|   |   |-- assets
|   |   |   |-- dto
|   |   |   |   |-- create-asset.dto.ts
|   |   |   |   |-- query-asset.dto.ts
|   |   |   |   `-- update-asset.dto.ts
|   |   |   |-- entities
|   |   |   |   `-- asset.entity.ts
|   |   |   |-- assets.controller.ts
|   |   |   |-- assets.module.ts
|   |   |   `-- assets.service.ts
|   |   |-- assignments
|   |   |   |-- dto
|   |   |   |   |-- issue-asset.dto.ts
|   |   |   |   `-- return-asset.dto.ts
|   |   |   |-- entities
|   |   |   |   `-- assignment.entity.ts
|   |   |   |-- assignments.controller.ts
|   |   |   |-- assignments.module.ts
|   |   |   `-- assignments.service.ts
|   |   |-- attachments
|   |   |   |-- dto
|   |   |   |   `-- create-attachment.dto.ts
|   |   |   |-- entities
|   |   |   |   `-- attachment.entity.ts
|   |   |   |-- attachments.controller.ts
|   |   |   |-- attachments.module.ts
|   |   |   `-- attachments.service.ts
|   |   |-- auth
|   |   |   |-- dto
|   |   |   |   |-- login.dto.ts
|   |   |   |   `-- refresh-token.dto.ts
|   |   |   |-- entities
|   |   |   |-- strategies
|   |   |   |   `-- jwt.strategy.ts
|   |   |   |-- auth.controller.ts
|   |   |   |-- auth.module.ts
|   |   |   `-- auth.service.ts
|   |   |-- companies
|   |   |   |-- dto
|   |   |   |   |-- create-company.dto.ts
|   |   |   |   `-- update-company.dto.ts
|   |   |   |-- entities
|   |   |   |   `-- company.entity.ts
|   |   |   |-- companies.controller.ts
|   |   |   |-- companies.module.ts
|   |   |   `-- companies.service.ts
|   |   |-- departments
|   |   |   |-- dto
|   |   |   |   |-- create-department.dto.ts
|   |   |   |   `-- update-department.dto.ts
|   |   |   |-- entities
|   |   |   |   `-- department.entity.ts
|   |   |   |-- departments.controller.ts
|   |   |   |-- departments.module.ts
|   |   |   `-- departments.service.ts
|   |   |-- disposal
|   |   |   |-- dto
|   |   |   |   `-- create-disposal.dto.ts
|   |   |   |-- entities
|   |   |   |   `-- disposal.entity.ts
|   |   |   |-- disposal.controller.ts
|   |   |   |-- disposal.module.ts
|   |   |   `-- disposal.service.ts
|   |   |-- employees
|   |   |   |-- dto
|   |   |   |   |-- create-employee.dto.ts
|   |   |   |   `-- update-employee.dto.ts
|   |   |   |-- entities
|   |   |   |   `-- employee.entity.ts
|   |   |   |-- employees.controller.ts
|   |   |   |-- employees.module.ts
|   |   |   `-- employees.service.ts
|   |   |-- goods-receipt
|   |   |   |-- dto
|   |   |   |   `-- create-goods-receipt.dto.ts
|   |   |   |-- entities
|   |   |   |   |-- goods-receipt-item.entity.ts
|   |   |   |   `-- goods-receipt.entity.ts
|   |   |   |-- goods-receipt.controller.ts
|   |   |   |-- goods-receipt.module.ts
|   |   |   `-- goods-receipt.service.ts
|   |   |-- locations
|   |   |   |-- dto
|   |   |   |   |-- create-location.dto.ts
|   |   |   |   `-- update-location.dto.ts
|   |   |   |-- entities
|   |   |   |   `-- location.entity.ts
|   |   |   |-- locations.controller.ts
|   |   |   |-- locations.module.ts
|   |   |   `-- locations.service.ts
|   |   |-- movements
|   |   |   |-- dto
|   |   |   |   `-- create-movement.dto.ts
|   |   |   |-- entities
|   |   |   |   `-- movement.entity.ts
|   |   |   |-- movements.controller.ts
|   |   |   |-- movements.module.ts
|   |   |   `-- movements.service.ts
|   |   |-- purchasing
|   |   |   |-- dto
|   |   |   |   |-- create-purchase-order-item.dto.ts
|   |   |   |   |-- create-purchase-order.dto.ts
|   |   |   |   `-- update-purchase-order-status.dto.ts
|   |   |   |-- entities
|   |   |   |   |-- purchase-order-item.entity.ts
|   |   |   |   `-- purchase-order.entity.ts
|   |   |   |-- purchasing.controller.ts
|   |   |   |-- purchasing.module.ts
|   |   |   `-- purchasing.service.ts
|   |   |-- repairs
|   |   |   |-- dto
|   |   |   |   |-- create-repair.dto.ts
|   |   |   |   `-- update-repair-status.dto.ts
|   |   |   |-- entities
|   |   |   |   `-- repair.entity.ts
|   |   |   |-- repairs.controller.ts
|   |   |   |-- repairs.module.ts
|   |   |   `-- repairs.service.ts
|   |   |-- requisitions
|   |   |   |-- dto
|   |   |   |   |-- approve-requisition.dto.ts
|   |   |   |   `-- create-requisition.dto.ts
|   |   |   |-- entities
|   |   |   |   |-- requisition-approval.entity.ts
|   |   |   |   |-- requisition-item.entity.ts
|   |   |   |   `-- requisition.entity.ts
|   |   |   |-- requisitions.controller.ts
|   |   |   |-- requisitions.module.ts
|   |   |   `-- requisitions.service.ts
|   |   |-- roles-permissions
|   |   |   |-- dto
|   |   |   |   |-- assign-permission.dto.ts
|   |   |   |   |-- assign-role.dto.ts
|   |   |   |   |-- create-permission.dto.ts
|   |   |   |   `-- create-role.dto.ts
|   |   |   |-- entities
|   |   |   |   |-- employee-role.entity.ts
|   |   |   |   |-- permission.entity.ts
|   |   |   |   |-- role-permission.entity.ts
|   |   |   |   `-- role.entity.ts
|   |   |   |-- roles-permissions.controller.ts
|   |   |   |-- roles-permissions.module.ts
|   |   |   `-- roles-permissions.service.ts
|   |   |-- stock
|   |   |   |-- dto
|   |   |   |   |-- adjust-stock.dto.ts
|   |   |   |   |-- create-stock-item.dto.ts
|   |   |   |   `-- update-stock-item.dto.ts
|   |   |   |-- entities
|   |   |   |   |-- stock-item.entity.ts
|   |   |   |   `-- stock-level.entity.ts
|   |   |   |-- stock.controller.ts
|   |   |   |-- stock.module.ts
|   |   |   `-- stock.service.ts
|   |   |-- users
|   |   |   |-- dto
|   |   |   |   |-- create-user.dto.ts
|   |   |   |   `-- update-user.dto.ts
|   |   |   |-- entities
|   |   |   |   `-- user.entity.ts
|   |   |   |-- users.controller.ts
|   |   |   |-- users.module.ts
|   |   |   `-- users.service.ts
|   |   |-- vendors
|   |   |   |-- dto
|   |   |   |   |-- create-vendor.dto.ts
|   |   |   |   `-- update-vendor.dto.ts
|   |   |   |-- entities
|   |   |   |   `-- vendor.entity.ts
|   |   |   |-- vendors.controller.ts
|   |   |   |-- vendors.module.ts
|   |   |   `-- vendors.service.ts
|   |   `-- warranty
|   |       |-- dto
|   |       |   |-- create-warranty.dto.ts
|   |       |   `-- renew-warranty.dto.ts
|   |       |-- entities
|   |       |   `-- warranty.entity.ts
|   |       |-- warranty.controller.ts
|   |       |-- warranty.module.ts
|   |       `-- warranty.service.ts
|   |-- app.module.ts
|   `-- main.ts
|-- .env
|-- .env.example
|-- nest-cli.json
|-- package.json
|-- tsconfig.build.json
`-- tsconfig.json

76 directories, 148 files
```
