import React, { useRef, useState } from "react";
import { Box, Typography, Button, useTheme } from "@mui/material";
import { CloudUploadOutlined, InsertDriveFileOutlined } from "@mui/icons-material";

interface FileUploadProps {
  onFileSelect: (file: File | null) => void;
  acceptedTypes?: string;
  label?: string;
}

export default function FileUpload({
  onFileSelect,
  acceptedTypes = ".csv",
  label = "Upload File",
}: FileUploadProps) {
  const [dragActive, setDragActive]     = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const theme    = useTheme();
  const isDark   = theme.palette.mode === "dark";

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) selectFile(e.dataTransfer.files[0]);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) selectFile(e.target.files[0]);
  };

  const selectFile = (file: File) => {
    setSelectedFile(file);
    onFileSelect(file);
  };

  const clearFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFile(null);
    onFileSelect(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <Box
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      sx={{
        border: "1.5px dashed",
        borderColor: dragActive
          ? "primary.main"
          : isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.15)",
        borderRadius: 2,
        p: { xs: 3, md: 4 },
        textAlign: "center",
        backgroundColor: dragActive
          ? isDark ? "rgba(110,168,254,0.05)" : "rgba(26,115,232,0.03)"
          : "transparent",
        transition: "all 180ms ease",
        cursor: "pointer",
        "&:hover": {
          borderColor: "primary.main",
          backgroundColor: isDark ? "rgba(110,168,254,0.04)" : "rgba(26,115,232,0.02)",
        },
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={acceptedTypes}
        onChange={handleChange}
        style={{ display: "none" }}
      />

      {selectedFile ? (
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
          <InsertDriveFileOutlined sx={{ fontSize: 36, color: "primary.main" }} />
          <Typography sx={{ fontWeight: 600, color: "text.primary", fontSize: "0.875rem" }}>
            {selectedFile.name}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {(selectedFile.size / 1024).toFixed(1)} KB
          </Typography>
          <Button
            size="small"
            variant="outlined"
            onClick={clearFile}
            sx={{ mt: 0.5, fontSize: "0.75rem" }}
          >
            Remove
          </Button>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.75 }}>
          <CloudUploadOutlined
            sx={{ fontSize: 36, color: "text.disabled", mb: 0.5 }}
          />
          <Typography sx={{ fontWeight: 500, color: "text.primary", fontSize: "0.875rem" }}>
            {label}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Drag & drop or click to browse &mdash; {acceptedTypes.toUpperCase()} only
          </Typography>
        </Box>
      )}
    </Box>
  );
}
