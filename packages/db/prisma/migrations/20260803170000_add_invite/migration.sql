-- CreateTable
CREATE TABLE `Invite` (
    `id` VARCHAR(191) NOT NULL,
    `barbershop_id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `token_hash` VARCHAR(191) NOT NULL,
    `consumed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Invite_token_hash_key`(`token_hash`),
    INDEX `Invite_barbershop_id_idx`(`barbershop_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Invite` ADD CONSTRAINT `Invite_barbershop_id_fkey` FOREIGN KEY (`barbershop_id`) REFERENCES `Barbershop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

