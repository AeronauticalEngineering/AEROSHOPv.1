"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Search, X, User, Save, ChevronLeft, ChevronRight, Loader2, Mail, Phone, Shield, Lock, AlertCircle, Eye, EyeOff } from "lucide-react";
import { UserProfile } from "@/types/user";
import { collection, deleteDoc, doc, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";

// --- Schema Validation ---
// Base schema for shared fields
const baseSchema = z.object({
    name: z.string().min(1, "กรุณากรอกชื่อ-นามสกุล"),
    email: z.string().email("อีเมลไม่ถูกต้อง"),
    phone: z.string().optional().or(z.literal('')),
    role: z.enum(['admin', 'employee', 'customer']),
    lineId: z.string().optional(),
    address: z.string().optional(),
    password: z.string().optional(), // Make password optional in base
});

// Schema for creating new user - password required
const createEmployeeSchema = baseSchema.extend({
    password: z.string().min(6, "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"),
});

// Schema for editing - password optional
const editEmployeeSchema = baseSchema.extend({
    password: z.string().min(6, "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร").optional().or(z.literal('')),
});

// Use the looser schema for form values to satisfy both create (strict) and edit (loose) types
type EmployeeFormValues = z.infer<typeof editEmployeeSchema>;

export default function AdminEmployeesPage() {
    const [employees, setEmployees] = useState<UserProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<UserProfile | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [isSaving, setIsSaving] = useState(false);
    const [showPassword, setShowPassword] = useState(false); // Toggle password visibility
    const itemsPerPage = 10;

    const { register, handleSubmit, reset, formState: { errors } } = useForm<EmployeeFormValues>({
        resolver: zodResolver(editingEmployee ? editEmployeeSchema : createEmployeeSchema),
        defaultValues: {
            role: 'employee',
        }
    });

    useEffect(() => {
        const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as UserProfile[];

            const staff = items.filter(u => u.role === 'admin' || u.role === 'employee');
            setEmployees(staff);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const onSubmit = async (data: any) => {
        setIsSaving(true);
        try {
            const payload = { ...data };
            // If editing and password is empty, remove it from payload
            if (editingEmployee && (!payload.password || payload.password.trim() === '')) {
                delete payload.password;
            }

            let res;
            if (editingEmployee) {
                // Edit: Use API to update Auth & Firestore
                res = await fetch('/api/admin/users', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...payload, uid: editingEmployee.id }) // Include UID
                });
            } else {
                // Create: Call API
                res = await fetch('/api/admin/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }

            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Operation failed');

            closeModal();
            // Optional: User feedback success
        } catch (error: any) {
            console.error("Error saving employee:", error);
            alert(`เกิดข้อผิดพลาด: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm("ยืนยันลบพนักงานคนนี้? ข้อมูลและสิทธิ์การเข้าใช้งานจะถูกลบถาวร")) return;

        try {
            const res = await fetch(`/api/admin/users?uid=${id}`, { method: 'DELETE' });

            if (!res.ok) {
                console.warn("API delete failed, falling back to Firestore delete");
                await deleteDoc(doc(db, "users", id));
            }
        } catch (error) {
            console.error("Error deleting employee:", error);
            alert("เกิดข้อผิดพลาดในการลบ");
        }
    };

    const openEditModal = (employee: UserProfile) => {
        setEditingEmployee(employee);
        setShowPassword(false);
        reset({
            name: employee.name || employee.displayName || '',
            email: employee.email || '',
            phone: employee.phone || '',
            role: employee.role,
            lineId: employee.lineId || '',
            address: employee.address || '',
            password: '' // Default empty for edit
        });
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingEmployee(null);
        setShowPassword(false);
        reset({ name: '', email: '', phone: '', role: 'employee', lineId: '', address: '', password: '' });
    };

    const filteredEmployees = employees.filter(e => {
        const name = e.name || e.displayName || '';
        const email = e.email || '';
        return name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            email.toLowerCase().includes(searchTerm.toLowerCase());
    });

    const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);
    const paginatedEmployees = filteredEmployees.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">จัดการพนักงาน</h1>
                    <p className="text-sm text-gray-500 mt-1">รายชื่อพนักงานและผู้ดูแลระบบทั้งหมด</p>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="ค้นหาชื่อ, อีเมล..."
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                        />
                    </div>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm shadow-sm hover:bg-blue-700 transition-all hover:shadow-md w-full sm:w-auto shrink-0"
                    >
                        <Plus size={18} />
                        เพิ่มพนักงาน
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                {isLoading ? (
                    <div className="p-12 text-center text-gray-500">
                        <Loader2 className="animate-spin mx-auto mb-3 text-blue-500" size={32} />
                        <p className="font-medium animate-pulse">กำลังโหลดข้อมูล...</p>
                    </div>
                ) : filteredEmployees.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <User size={32} className="text-gray-400" />
                        </div>
                        <p className="font-medium">ไม่พบรายชื่อพนักงาน</p>
                    </div>
                ) : (
                    <>
                        <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 bg-gray-50/50 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                            <div className="col-span-4">ชื่อ-นามสกุล</div>
                            <div className="col-span-3">ติดต่อ</div>
                            <div className="col-span-2">ตำแหน่ง</div>
                            <div className="col-span-3 text-right">จัดการ</div>
                        </div>

                        <div className="divide-y divide-gray-50">
                            {paginatedEmployees.map((employee) => (
                                <div
                                    key={employee.id}
                                    onClick={() => openEditModal(employee)}
                                    className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-blue-50/50 cursor-pointer transition-colors group"
                                >
                                    <div className="col-span-12 md:col-span-4 flex items-center gap-3">
                                        <div className="w-10 h-10 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 border border-blue-200/50">
                                            {employee.photoURL || employee.pictureUrl ? (
                                                <img src={employee.photoURL || employee.pictureUrl} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <User size={18} className="text-blue-600" />
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-semibold text-sm text-gray-900 truncate">
                                                {employee.name || employee.displayName || 'ไม่ระบุชื่อ'}
                                            </p>
                                            <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                                                ID: <span className="font-mono">{employee.id.slice(0, 8)}...</span>
                                            </p>
                                        </div>
                                    </div>

                                    <div className="hidden md:block col-span-3 space-y-1">
                                        {employee.email && (
                                            <div className="flex items-center gap-1.5 text-xs text-gray-600">
                                                <Mail size={12} className="text-gray-400" />
                                                <span className="truncate">{employee.email}</span>
                                            </div>
                                        )}
                                        {employee.phone && (
                                            <div className="flex items-center gap-1.5 text-xs text-gray-600">
                                                <Phone size={12} className="text-gray-400" />
                                                <span className="truncate">{employee.phone}</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="hidden md:block col-span-2">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${employee.role === 'admin'
                                            ? 'bg-purple-100 text-purple-700'
                                            : 'bg-blue-100 text-blue-700'
                                            }`}>
                                            <Shield size={10} />
                                            {employee.role === 'admin' ? 'ผู้ดูแลระบบ' : 'พนักงาน'}
                                        </span>
                                    </div>

                                    <div className="col-span-12 md:col-span-3 flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); openEditModal(employee); }}
                                            className="p-2 hover:bg-white bg-white/50 border border-transparent hover:border-gray-200 rounded-lg text-gray-500 hover:text-blue-600 shadow-sm transition-all"
                                        >
                                            <Pencil size={16} />
                                        </button>
                                        <button
                                            onClick={(e) => handleDelete(employee.id, e)}
                                            className="p-2 hover:bg-red-50 hover:border-red-100 bg-white/50 border border-transparent rounded-lg text-gray-400 hover:text-red-600 shadow-sm transition-all"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {totalPages > 1 && (
                            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between text-sm bg-gray-50/50">
                                <span className="text-gray-500">
                                    แสดง {((currentPage - 1) * itemsPerPage) + 1} ถึง {Math.min(currentPage * itemsPerPage, filteredEmployees.length)} จาก {filteredEmployees.length} คน
                                </span>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="p-2 rounded-lg hover:bg-white border border-transparent hover:border-gray-200 disabled:opacity-30 disabled:hover:bg-transparent"
                                    >
                                        <ChevronLeft size={18} />
                                    </button>
                                    <span className="font-medium text-gray-700">{currentPage}</span>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="p-2 rounded-lg hover:bg-white border border-transparent hover:border-gray-200 disabled:opacity-30 disabled:hover:bg-transparent"
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        {/* Modal Header */}
                        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                            <div>
                                <h2 className="font-bold text-lg text-gray-900">
                                    {editingEmployee ? 'แก้ไขข้อมูลพนักงาน' : 'เพิ่มพนักงานใหม่'}
                                </h2>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    {editingEmployee ? 'แก้ไขรายละเอียดส่วนตัว' : 'สร้างบัญชีผู้ใช้สำหรับเข้าสู่ระบบ'}
                                </p>
                            </div>
                            <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 overflow-y-auto">
                            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                                {!editingEmployee ? (
                                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-start gap-3 text-sm text-blue-700">
                                        <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
                                        <p>ระบบจะสร้างบัญชีผู้ใช้ใหม่ในระบบ (Email/Password) พนักงานสามารถใช้อีเมลและรหัสผ่านนี้เข้าสู่ระบบได้ทันที</p>
                                    </div>
                                ) : (
                                    <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 flex items-start gap-3 text-sm text-orange-700">
                                        <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
                                        <p>คุณสามารถระบุรหัสผ่านใหม่ได้หากต้องการเปลี่ยน (เว้นว่างไว้หากไม่ต้องการเปลี่ยน)</p>
                                    </div>
                                )}

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">ชื่อ-นามสกุล <span className="text-red-500">*</span></label>
                                        <input
                                            {...register("name")}
                                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all"
                                            placeholder="ระบุชื่อจริง นามสกุล"
                                        />
                                        {errors.name && <p className="text-red-500 text-xs mt-1.5">{errors.name.message}</p>}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="col-span-2">
                                            <label className="block text-sm font-medium text-gray-700 mb-1.5">อีเมล (สำหรับเข้าสู่ระบบ) <span className="text-red-500">*</span></label>
                                            <input
                                                {...register("email")}
                                                type="email"
                                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all"
                                                placeholder="example@mail.com"
                                            />
                                            {errors.email && <p className="text-red-500 text-xs mt-1.5">{errors.email.message}</p>}
                                        </div>

                                        <div className="col-span-2">
                                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                                {editingEmployee ? 'รหัสผ่านใหม่ (เลือกใส่)' : <span>รหัสผ่าน <span className="text-red-500">*</span></span>}
                                            </label>
                                            <div className="relative">
                                                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                                    <Lock size={16} className="text-gray-400" />
                                                </div>
                                                <input
                                                    type={showPassword ? "text" : "password"}
                                                    {...register("password")}
                                                    className="w-full pl-10 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all"
                                                    placeholder={editingEmployee ? "เว้นว่างไว้ถ้าไม่เปลี่ยน" : "กำหนดรหัสผ่านอย่างน้อย 6 ตัวอักษร"}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                                                >
                                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                                </button>
                                            </div>
                                            {errors.password && <p className="text-red-500 text-xs mt-1.5">{errors.password.message}</p>}
                                        </div>

                                        <div className="col-span-2">
                                            <label className="block text-sm font-medium text-gray-700 mb-1.5">เบอร์โทรศัพท์</label>
                                            <input
                                                {...register("phone")}
                                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all"
                                                placeholder="08x-xxx-xxxx"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">ตำแหน่ง <span className="text-red-500">*</span></label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <label className={`cursor-pointer border rounded-xl p-3 flex items-center gap-3 transition-all ${
                                                // @ts-ignore
                                                register("role").ref?.value === 'employee' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:border-gray-300'
                                                }`}>
                                                <input type="radio" value="employee" {...register("role")} className="w-4 h-4 text-blue-600" />
                                                <span className="text-sm font-medium">พนักงาน</span>
                                            </label>
                                            <label className="cursor-pointer border border-gray-200 rounded-xl p-3 flex items-center gap-3 hover:border-gray-300">
                                                <input type="radio" value="admin" {...register("role")} className="w-4 h-4 text-purple-600" />
                                                <span className="text-sm font-medium">ผู้ดูแลระบบ</span>
                                            </label>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">ที่อยู่</label>
                                        <textarea
                                            {...register("address")}
                                            rows={2}
                                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all resize-none"
                                            placeholder="ที่อยู่สำหรับจัดส่ง (ถ้ามี)"
                                        />
                                    </div>
                                </div>

                                {/* Submit Buttons */}
                                <div className="flex gap-3 pt-4 border-t border-gray-100 mt-6">
                                    <button
                                        type="button"
                                        onClick={closeModal}
                                        className="flex-1 py-2.5 border border-gray-200 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                                    >
                                        ยกเลิก
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSaving}
                                        className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-all"
                                    >
                                        {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                                        {isSaving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
