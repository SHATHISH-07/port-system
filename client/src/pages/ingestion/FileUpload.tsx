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
        border: "2px dashed",
        borderColor: dragActive
          ? "primary.main"
          : isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
        borderRadius: 4,
        p: { xs: 4, md: 5 },
        textAlign: "center",
        backgroundColor: dragActive
          ? isDark ? "rgba(110,168,254,0.08)" : "rgba(26,115,232,0.04)"
          : isDark ? "rgba(255,255,255,0.01)" : "rgba(0,0,0,0.01)",
        transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        cursor: "pointer",
        "&:hover": {
          borderColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)",
          backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
          transform: "translateY(-1px)",
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
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5 }}>
          <InsertDriveFileOutlined sx={{ fontSize: 48, color: "primary.main" }} />
          <Box>
            <Typography sx={{ fontWeight: 700, color: "text.primary", fontSize: "0.95rem" }}>
              {selectedFile.name}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.8rem" }}>
              {(selectedFile.size / 1024).toFixed(1)} KB
            </Typography>
          </Box>
          <Button
            size="small"
            color="error"
            onClick={clearFile}
            sx={{ mt: 1, fontSize: "0.75rem", textTransform: "none", fontWeight: 600, borderRadius: 2 }}
          >
            Remove File
          </Button>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
          <CloudUploadOutlined
            sx={{ fontSize: 48, color: "text.disabled", mb: 1 }}
          />
          <Typography sx={{ fontWeight: 600, color: "text.primary", fontSize: "1rem" }}>
            {label}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.8rem" }}>
            Drag & drop or click to browse &mdash; {acceptedTypes.toUpperCase()} only
          </Typography>
        </Box>
      )}
    </Box>
  );
}
