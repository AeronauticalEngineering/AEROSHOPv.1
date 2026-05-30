"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { auth } from "@/lib/firebase";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Store,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const loginSchema = z.object({
  email: z.string().email("รูปแบบอีเมลไม่ถูกต้อง"),
  password: z.string().min(6, "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function AdminLoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const router = useRouter();
  const { userProfile } = useAuth();

  useEffect(() => {
    if (
      userProfile &&
      (userProfile.role === "admin" || userProfile.role === "employee")
    ) {
      router.replace("/dashboard");
    }
  }, [userProfile, router]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    setAuthError(null);

    try {
      await signInWithEmailAndPassword(auth, data.email, data.password);
    } catch (error: unknown) {
      console.error("Login error:", error);
      const authCode = error instanceof FirebaseError ? error.code : "";

      if (
        authCode === "auth/invalid-credential" ||
        authCode === "auth/user-not-found" ||
        authCode === "auth/wrong-password"
      ) {
        setAuthError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      } else if (authCode === "auth/too-many-requests") {
        setAuthError("เข้าสู่ระบบผิดพลาดหลายครั้ง กรุณาลองใหม่ภายหลัง");
      } else {
        setAuthError("เกิดข้อผิดพลาดในการเข้าสู่ระบบ");
      }

      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4 py-8">
      <section className="grid w-full max-w-4xl overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm md:grid-cols-[0.95fr_1.05fr]">
        <div className="hidden bg-[#171717] p-8 text-white md:flex md:flex-col md:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-white/10 bg-white/10 p-2">
              <Store size={22} />
            </div>
            <span className="text-lg font-bold tracking-wide">Eshop Admin</span>
          </div>

          <div>
            <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-white text-black">
              <ShieldCheck size={24} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              จัดการร้านค้า
            </h1>
            <p className="mt-2 text-sm text-white/50">สำหรับผู้ดูแลและพนักงาน</p>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          <div className="mb-7 flex items-center gap-3 md:hidden">
            <div className="rounded-lg bg-[#171717] p-2 text-white">
              <Store size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-wide text-gray-900">
                Eshop Admin
              </h1>
              <p className="text-xs text-gray-500">เข้าสู่ระบบผู้ดูแล</p>
            </div>
          </div>

          <div className="mb-6 hidden md:block">
            <h2 className="text-xl font-bold text-gray-900">เข้าสู่ระบบ</h2>
            <p className="mt-1 text-sm text-gray-500">กรอกข้อมูลบัญชีผู้ดูแล</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {authError && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
              {authError}
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-semibold text-gray-700"
            >
              อีเมล
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Mail size={17} className="text-gray-400" />
              </div>
              <input
                id="email"
                type="email"
                autoComplete="email"
                {...register("email")}
                className="h-11 w-full rounded-xl border border-gray-100 bg-gray-50 pl-10 pr-3 text-sm font-medium text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:ring-4 focus:ring-gray-100"
                placeholder="admin@example.com"
              />
            </div>
            {errors.email && (
              <p className="ml-1 mt-1.5 text-xs font-medium text-red-500">
                {errors.email.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-semibold text-gray-700"
            >
              รหัสผ่าน
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Lock size={17} className="text-gray-400" />
              </div>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                {...register("password")}
                className="h-11 w-full rounded-xl border border-gray-100 bg-gray-50 pl-10 pr-10 text-sm font-medium text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:ring-4 focus:ring-gray-100"
                placeholder="********"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 transition-colors hover:text-gray-700"
                aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {errors.password && (
              <p className="ml-1 mt-1.5 text-xs font-medium text-red-500">
                {errors.password.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#171717] text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                กำลังเข้าสู่ระบบ...
              </>
            ) : (
              "เข้าสู่ระบบ"
            )}
          </button>
          </form>
        </div>
      </section>
    </main>
  );
}
