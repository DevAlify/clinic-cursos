export const CAMPAIGN_PATTERN = /^(sp|rj|cps|online)_[a-z0-9]+_[a-z0-9]+_\d{6}$/;
export const ENTRY_POINT_PATTERN = /^(sp|rj|cps|online)-[a-z0-9]+-[a-z0-9-]+-\d{2}$/;

export const isValidCampaign = (value: string): boolean => CAMPAIGN_PATTERN.test(value);
export const isValidEntryPoint = (value: string): boolean => ENTRY_POINT_PATTERN.test(value);
