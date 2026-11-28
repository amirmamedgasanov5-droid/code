
import { db } from '../../firebase';
import { 
    collection, query, where, getDocs, addDoc, serverTimestamp 
} from 'firebase/firestore';

export const checkAchievements = async (studentId: string, setToast: (t: { visible: boolean, message: string, type: 'success' | 'error' | 'warning' | 'info' }) => void) => {
    try {
        // Achievement 1: Elm Tələb Edən (5 fives)
        const qFives = query(collection(db, 'journal_v2'), where('studentId', '==', studentId), where('mark', '==', '5'), where('type', '==', 'daily'));
        const snapFives = await getDocs(qFives);
        
        const qHwFives = query(collection(db, 'submissions'), where('studentId', '==', studentId), where('status', '==', 'graded'), where('grade', '==', '5'));
        const snapHwFives = await getDocs(qHwFives);

        const totalFives = snapFives.size + snapHwFives.size;

        if (totalFives >= 5) {
            const achQ = query(collection(db, 'achievements'), where('studentId', '==', studentId), where('type', '==', 'elm_teleb_eden'));
            const achSnap = await getDocs(achQ);
            
            if (achSnap.empty) {
                await addDoc(collection(db, 'achievements'), {
                    studentId,
                    type: 'elm_teleb_eden',
                    name: "Elm Tələb Edən",
                    description: "5 ədəd '5' qiyməti topladığı üçün",
                    earnedAt: serverTimestamp()
                });
                setToast({ visible: true, message: "Şagird yeni nailiyyət qazandı: Elm Tələb Edən!", type: 'success' });
            }
        }

        // Achievement 2: Davamlı Şagird
        const qAll = query(collection(db, 'journal_v2'), where('studentId', '==', studentId), where('type', '==', 'daily'));
        const snapAll = await getDocs(qAll);
        if (snapAll.size >= 10) {
             const achQ2 = query(collection(db, 'achievements'), where('studentId', '==', studentId), where('type', '==', 'davamli_sagird'));
             const achSnap2 = await getDocs(achQ2);
             if (achSnap2.empty) {
                 await addDoc(collection(db, 'achievements'), {
                     studentId,
                     type: 'davamli_sagird',
                     name: "Davamlı Şagird",
                     description: "10 dərsi uğurla tamamladığı üçün",
                     earnedAt: serverTimestamp()
                 });
                 setToast({ visible: true, message: "Şagird yeni nailiyyət qazandı: Davamlı Şagird!", type: 'success' });
             }
        }

         // Achievement 3: İntizamlı (20 marks total)
         if (snapAll.size >= 20) {
            const achQ3 = query(collection(db, 'achievements'), where('studentId', '==', studentId), where('type', '==', 'intizamli'));
            const achSnap3 = await getDocs(achQ3);
            if (achSnap3.empty) {
                await addDoc(collection(db, 'achievements'), {
                    studentId,
                    type: 'intizamli',
                    name: "İntizamlı",
                    description: "20-dən çox qiymət topladığı üçün",
                    earnedAt: serverTimestamp()
                });
                setToast({ visible: true, message: "Şagird yeni nailiyyət qazandı: İntizamlı!", type: 'success' });
            }
        }

        // Achievement 4: İlk Addım (First entry)
        if (snapAll.size === 1) {
             const achQ4 = query(collection(db, 'achievements'), where('studentId', '==', studentId), where('type', '==', 'ilk_addim'));
             const achSnap4 = await getDocs(achQ4);
             if (achSnap4.empty) {
                 await addDoc(collection(db, 'achievements'), {
                     studentId,
                     type: 'ilk_addim',
                     name: "İlk Addım",
                     description: "Sistemdə ilk qiymətini aldığı üçün",
                     earnedAt: serverTimestamp()
                 });
                 setToast({ visible: true, message: "Şagird yeni nailiyyət qazandı: İlk Addım!", type: 'success' });
             }
        }
    } catch (e) {
        console.error("Achievement check failed", e);
    }
};
