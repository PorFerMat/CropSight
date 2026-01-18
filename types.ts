export enum ViewState {
  HOME = 'HOME',
  SCAN = 'SCAN',
  RESULT = 'RESULT',
  HISTORY = 'HISTORY',
}

export type AnalysisMode = 'DIAGNOSIS' | 'IDENTIFICATION';

export enum CropType {
  TOMATO = 'Tomato',
  WHEAT = 'Wheat',
  RICE = 'Rice',
  CORN = 'Corn',
  SOYBEAN = 'Soybean',
  POTATO = 'Potato',
  OTHER = 'Other',
}

export enum GrowthStage {
  SEEDLING = 'Seedling',
  VEGETATIVE = 'Vegetative',
  FLOWERING = 'Flowering',
  FRUITING = 'Fruiting',
  MATURITY = 'Maturity',
}

export interface IoTData {
  temperature: number;
  humidity: number;
  soilMoisture: number;
}

export interface AnalysisResult {
  id: string;
  timestamp: number;
  imageUrl: string;
  cropType: string;
  growthStage: string;
  diagnosis: string;
  confidence: number;
  treatment: string[];
  prevention: string[];
  description: string; // User provided description
  mode?: AnalysisMode;
  sources?: { title: string; uri: string }[];
  iotData?: IoTData;
}

// JSON Schema structure for the AI response
export interface AIAnalysisResponse {
  diagnosis: string;
  confidence: number;
  treatment: string[];
  prevention: string[];
}

export interface HistoryItem extends AnalysisResult {}