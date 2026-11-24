"use client";

import { createContext, useContext } from "react";
import type { Advisor } from "@vigie/shared";

export const AdvisorContext = createContext<Advisor | null>(null);
export const useAdvisor = () => useContext(AdvisorContext);
