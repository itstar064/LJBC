interface JobType {
  id: string;
  bidPlaced: boolean;
}

export interface ScrapedJobType {
  title: string;
  url: string;
  desc: string;
  category: string;
  price: string;
  suggestions: string;
  daysLeft: string;
  deadline: string;
  postedDate: string;
  employer: string;
  employerUrl: string;
  employerAvatar: string;
}

export default JobType;
