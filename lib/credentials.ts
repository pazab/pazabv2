import { supabase } from "@/lib/supabase";

export interface JobCredential {
  id?: string;
  category_name: string;
  duty_name: string;
  name: string;
  is_mandatory_by_law: boolean;
  description?: string;
}

export const DEFAULT_CREDENTIALS_FALLBACK: JobCredential[] = [
  // 카페/음료
  { category_name: '카페/음료', duty_name: '바리스타', name: '보건증', is_mandatory_by_law: true, description: '식품위생법 제49조에 따른 건강진단결과서 (식품위생업 필수)' },
  { category_name: '카페/음료', duty_name: '바리스타', name: '바리스타 자격증', is_mandatory_by_law: false, description: '한국커피협회 등 공인 바리스타 자격 요건' },
  { category_name: '카페/음료', duty_name: '바리스타', name: '라떼아트 수료증', is_mandatory_by_law: false, description: '라떼아트 관련 교육 이수증' },
  { category_name: '카페/음료', duty_name: '홀서빙', name: '보건증', is_mandatory_by_law: true, description: '식품위생법 제49조에 따른 건강진단결과서 (식품위생업 필수)' },
  { category_name: '카페/음료', duty_name: '주방보조', name: '보건증', is_mandatory_by_law: true, description: '식품위생법 제49조에 따른 건강진단결과서 (식품위생업 필수)' },
  { category_name: '카페/음료', duty_name: '주방보조', name: '조리기능사', is_mandatory_by_law: false, description: '한식/양식/일식/중식 등 조리기능사 국가기술자격' },
  { category_name: '카페/음료', duty_name: '제빵/베이커리', name: '보건증', is_mandatory_by_law: true, description: '식품위생법 제49조에 따른 건강진단결과서 (식품위생업 필수)' },
  { category_name: '카페/음료', duty_name: '제빵/베이커리', name: '제빵기능사', is_mandatory_by_law: false, description: '제빵기능사 국가기술자격' },
  { category_name: '카페/음료', duty_name: '제빵/베이커리', name: '제과기능사', is_mandatory_by_law: false, description: '제과기능사 국가기술자격' },
  { category_name: '카페/음료', duty_name: '포장/배달', name: '보건증', is_mandatory_by_law: true, description: '식품위생법 제49조에 따른 건강진단결과서 (식품위생업 필수)' },
  { category_name: '카페/음료', duty_name: '포장/배달', name: '운전면허증', is_mandatory_by_law: false, description: '배송 및 차량 운전에 필요한 면허' },
  { category_name: '카페/음료', duty_name: '포장/배달', name: '원동기면허증', is_mandatory_by_law: false, description: '이륜차 배달에 필요한 원동기 장치 자전거 면허' },

  // 식당/음식점
  { category_name: '식당/음식점', duty_name: '홀서빙', name: '보건증', is_mandatory_by_law: true, description: '식품위생법 제49조에 따른 건강진단결과서 (식품위생업 필수)' },
  { category_name: '식당/음식점', duty_name: '주방보조', name: '보건증', is_mandatory_by_law: true, description: '식품위생법 제49조에 따른 건강진단결과서 (식품위생업 필수)' },
  { category_name: '식당/음식점', duty_name: '주방보조', name: '조리기능사', is_mandatory_by_law: false, description: '한식/양식/일식/중식 등 조리기능사 국가기술자격' },
  { category_name: '식당/음식점', duty_name: '포장/배달', name: '보건증', is_mandatory_by_law: true, description: '식품위생법 제49조에 따른 건강진단결과서 (식품위생업 필수)' },
  { category_name: '식당/음식점', duty_name: '포장/배달', name: '운전면허증', is_mandatory_by_law: false, description: '배송 및 차량 운전에 필요한 면허' },
  { category_name: '식당/음식점', duty_name: '포장/배달', name: '원동기면허증', is_mandatory_by_law: false, description: '이륜차 배달에 필요한 원동기 장치 자전거 면허' },
  { category_name: '식당/음식점', duty_name: '설거지', name: '보건증', is_mandatory_by_law: true, description: '식품위생법 제49조에 따른 건강진단결과서 (식품위생업 필수)' },

  // 편의점/마트
  { category_name: '편의점/마트', duty_name: '배달', name: '운전면허증', is_mandatory_by_law: false, description: '배송 및 차량 운전에 필요한 면허' },
  { category_name: '편의점/마트', duty_name: '배달', name: '원동기면허증', is_mandatory_by_law: false, description: '이륜차 배달에 필요한 원동기 장치 자전거 면허' },

  // 뷰티/미용
  { category_name: '뷰티/미용', duty_name: '네일', name: '미용사(네일) 자격증', is_mandatory_by_law: true, description: '네일아트 국가기술자격증 (법적 필수)' },
  { category_name: '뷰티/미용', duty_name: '헤어보조', name: '미용사(일반) 자격증', is_mandatory_by_law: true, description: '헤어디자인 국가기술자격증 (법적 필수)' },
  { category_name: '뷰티/미용', duty_name: '피부관리보조', name: '미용사(피부) 자격증', is_mandatory_by_law: true, description: '피부미용 국가기술자격증 (법적 필수)' },

  // 물류/배송
  { category_name: '물류/배송', duty_name: '배송', name: '운전면허증', is_mandatory_by_law: true, description: '배송 및 차량 운전에 필요한 면허 (법적 필수)' },
  { category_name: '물류/배송', duty_name: '배송', name: '화물운송종사자격증', is_mandatory_by_law: false, description: '영업용 화물자동차 운전에 필요한 자격' },
  { category_name: '물류/배송', duty_name: '입출고', name: '지게차운전기능사', is_mandatory_by_law: false, description: '지게차 조작에 필요한 국가기술자격' },

  // 교육/돌봄
  { category_name: '교육/돌봄', duty_name: '아이돌봄', name: '보육교사 자격증', is_mandatory_by_law: false, description: '보육교사 전문 자격' },
  { category_name: '교육/돌봄', duty_name: '아이돌봄', name: '유치원 정교사 자격증', is_mandatory_by_law: false, description: '유치원 교사 자격' },
  { category_name: '교육/돌봄', duty_name: '노인돌봄', name: '요양보호사 자격증', is_mandatory_by_law: true, description: '노인 복지 서비스 제공에 필요한 법적 자격 (법적 필수)' },
  { category_name: '교육/돌봄', duty_name: '노인돌봄', name: '사회복지사 자격증', is_mandatory_by_law: false, description: '사회복지 전문 자격' },

  // 의료/복지
  { category_name: '의료/복지', duty_name: '요양보호', name: '요양보호사 자격증', is_mandatory_by_law: true, description: '노인 장기요양 서비스 제공에 필요한 법적 자격 (법적 필수)' },
  { category_name: '의료/복지', duty_name: '요양보호', name: '사회복지사 자격증', is_mandatory_by_law: false, description: '사회복지 전문 자격' },

  // 기타
  { category_name: '기타', duty_name: '보안/경비', name: '일반경비원 신임교육 이수증', is_mandatory_by_law: true, description: '경비업법에 따른 법정 의무 교육 이수증 (법적 필수)' },
  { category_name: '기타', duty_name: '주차관리', name: '운전면허증', is_mandatory_by_law: true, description: '차량 대리 주차에 필수적인 운전면허 (법적 필수)' },

  // 건설/노무
  { category_name: '건설/노무', duty_name: '경비/시설관리', name: '일반경비원 신임교육 이수증', is_mandatory_by_law: true, description: '경비업법에 따른 법정 의무 교육 이수증 (법적 필수)' },

  // 생산/제조
  { category_name: '생산/제조', duty_name: '기계조작', name: '지게차운전기능사', is_mandatory_by_law: false, description: '지게차 조작에 필요한 국가기술자격' }
];

export async function fetchCredentialsWithFallback(): Promise<JobCredential[]> {
  try {
    const { data, error } = await supabase
      .from("job_credentials")
      .select("*")
      .order("is_mandatory_by_law", { ascending: false });
    
    if (error || !data || data.length === 0) {
      console.warn("Using local fallback credentials. Supabase returned:", data, error);
      return DEFAULT_CREDENTIALS_FALLBACK;
    }
    return data;
  } catch (err) {
    console.error("Error fetching job credentials:", err);
    return DEFAULT_CREDENTIALS_FALLBACK;
  }
}
