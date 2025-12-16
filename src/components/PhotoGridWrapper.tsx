"use client";
import dynamic from "next/dynamic";
import { PhotoGridSkeleton } from "./PhotoGridSkeleton";

export const PhotoGrid = dynamic(() => import("~/components/PhotoGrid"), {
  ssr: false,
  loading: () => <PhotoGridSkeleton />,
});
