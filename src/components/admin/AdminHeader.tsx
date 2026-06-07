"use client";

import { Menu } from "lucide-react";

interface AdminHeaderProps {
    onMenuClick: () => void;
}

export default function AdminHeader({ onMenuClick }: AdminHeaderProps) {
    return (
        <header className="flex h-16 items-center">
            <button
                className="-ml-2 rounded-full p-2 hover:bg-gray-100 md:hidden"
                onClick={onMenuClick}
                aria-label="เปิดเมนู"
            >
                <Menu size={24} />
            </button>
            <h2 className="ml-2 text-lg font-semibold md:hidden">Eshop Admin</h2>
        </header>
    );
}
