"use client";

import { Eye, EyeOff, Lock, User } from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";

import { ZenZebraLogo } from "@/components/brand/ZenZebraLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
	const router = useRouter();
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const [showPassword, setShowPassword] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError("");
		setLoading(true);

		const form = new FormData(event.currentTarget);
		const username = form.get("username");
		const password = form.get("password");

		try {
			const response = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username, password }),
			});

			if (response.ok) {
				router.replace("/dashboard");
				return;
			}

			try {
				const data = await response.json();
				setError(data.error || "Invalid credentials");
			} catch {
				setError(`Server error (${response.status})`);
			}
		} catch (err: any) {
			setError(err?.message || "Network error");
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="relative flex h-dvh items-center justify-center bg-[#080C10] px-4 select-none">
			{/* Subtle Professional Grid Pattern & Glow Background */}
			<div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293715_1px,transparent_1px),linear-gradient(to_bottom,#1f293715_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />
			<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-96 rounded-full bg-emerald-500/5 blur-3xl pointer-events-none" />

			{/* Main Login Card */}
			<div className="relative z-10 w-full max-w-sm space-y-6">
				<div className="flex flex-col items-center gap-3">
					<ZenZebraLogo size="lg" showTagline />
				</div>

				<Card className="border border-zinc-800/80 bg-zinc-900/90 backdrop-blur-xl shadow-2xl shadow-black/40">
					<CardHeader className="pb-4 pt-6 text-center">
						<h2 className="text-base font-semibold tracking-tight text-zinc-100 font-mono">
							Sign in to your account
						</h2>
						<p className="text-xs text-zinc-400 mt-1">
							Enter your CRM credentials to continue
						</p>
					</CardHeader>

					<CardContent className="pb-6">
						<form onSubmit={handleSubmit} className="space-y-4">
							{/* Username Input */}
							<div className="space-y-1.5">
								<Label
									htmlFor="username"
									className="text-xs font-semibold uppercase tracking-wider text-zinc-300"
								>
									Username
								</Label>
								<div className="relative">
									<User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
									<Input
										id="username"
										name="username"
										type="text"
										autoComplete="username"
										defaultValue=""
										autoFocus
										required
										placeholder="Username"
										className="pl-9 bg-zinc-950/60 border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
									/>
								</div>
							</div>

							{/* Password Input */}
							<div className="space-y-1.5">
								<Label
									htmlFor="password"
									className="text-xs font-semibold uppercase tracking-wider text-zinc-300"
								>
									Password
								</Label>
								<div className="relative">
									<Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
									<Input
										id="password"
										name="password"
										type={showPassword ? "text" : "password"}
										autoComplete="current-password"
										defaultValue=""
										required
										placeholder="Password"
										className="pl-9 pr-9 bg-zinc-950/60 border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
									/>
									<button
										type="button"
										onClick={() => setShowPassword(!showPassword)}
										className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors focus:outline-none"
										aria-label={
											showPassword ? "Hide password" : "Show password"
										}
									>
										{showPassword ? (
											<EyeOff className="size-4" />
										) : (
											<Eye className="size-4" />
										)}
									</button>
								</div>
							</div>

							{/* Error Message */}
							{error && (
								<div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-center text-xs font-medium text-rose-400">
									{error}
								</div>
							)}

							{/* Submit Button */}
							<Button
								type="submit"
								disabled={loading}
								className="w-full bg-zinc-100 font-semibold text-xs text-zinc-950 hover:bg-white shadow-sm transition-all duration-200 disabled:opacity-50 mt-2"
							>
								{loading ? "Signing in..." : "Sign in"}
							</Button>
						</form>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
