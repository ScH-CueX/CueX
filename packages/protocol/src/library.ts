import type { DoctorProfile, ExpertPlaybookRule, TrainingScenarioDef } from './scenario';
export interface TeamExperience extends ExpertPlaybookRule { createdAt: string }
export type ExperienceInput = Pick<ExpertPlaybookRule, 'sourceSeniorRep' | 'scenarioContext' | 'goldenTactic' | 'antiPatternWarning'>;
export interface SynthesisInput {
  doctorStyle: DoctorProfile['style'];
  timeConstraintSec: number;
  experienceIds: string[];
}
export interface ScenarioSummary {
  id: string; sceneTitle: string; doctor: TrainingScenarioDef['doctor'];
  createdAt?: string; experienceCount: number; generated: boolean;
}
