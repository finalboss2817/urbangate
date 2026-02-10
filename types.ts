
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  BUILDING_ADMIN = 'BUILDING_ADMIN',
  RESIDENT = 'RESIDENT',
  SECURITY = 'SECURITY'
}

export interface Profile {
  id: string;
  role: UserRole;
  building_id?: string;
  full_name?: string;
  flat_number?: string;
}

export interface Building {
  id: string;
  name: string;
  address: string;
  resident_code: string;
  admin_code: string;
  security_code: string;
  created_at: string;
}

export interface Amenity {
  id: string;
  building_id: string;
  name: string;
  description: string;
  capacity: number;
  open_time: string;
  close_time: string;
}

export interface Booking {
  id: string;
  building_id: string;
  amenity_id: string;
  profile_id: string;
  resident_name: string;
  flat_number: string;
  date: string;
  start_time: string;
  end_time: string;
}

export interface Notice {
  id: string;
  building_id: string;
  title: string;
  content: string;
  created_at: string;
}

export interface Visitor {
  id: string;
  building_id: string;
  name: string;
  phone: string;
  purpose: string;
  flat_number: string;
  type: 'PRE_APPROVED' | 'WALK_IN';
  status: 'PENDING' | 'ENTERED' | 'EXITED' | 'REJECTED';
  check_in_at?: string;
  check_out_at?: string;
  invite_code?: string;
}
