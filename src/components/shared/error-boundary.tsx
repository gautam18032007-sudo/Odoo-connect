"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import React, { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { tokens } from "@/styles/tokens";

interface Props {
	children: ReactNode;
	fallbackTitle?: string;
}

interface State {
	hasError: boolean;
	error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
	public state: State = {
		hasError: false,
		error: null,
	};

	public static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		console.error("Uncaught Error Boundary Exception:", error, errorInfo);
	}

	private handleRetry = () => {
		this.setState({ hasError: false, error: null });
	};

	public render() {
		if (this.state.hasError) {
			return (
				<div className={tokens.effects.cardBase}>
					<div className="flex flex-col items-center justify-center p-8 text-center gap-4">
						<div className="p-3 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
							<AlertTriangle className="size-8" />
						</div>
						<div className="space-y-1 max-w-md">
							<h3 className="text-lg font-semibold text-zinc-100">
								{this.props.fallbackTitle || "Module Temporary Error"}
							</h3>
							<p className="text-xs text-zinc-400">
								An isolated UI rendering exception occurred. Your database
								records and calculations remain completely safe and untouched.
							</p>
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={this.handleRetry}
							className="mt-2 text-xs"
						>
							<RefreshCw className="mr-2 size-3" />
							Reload View
						</Button>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}
