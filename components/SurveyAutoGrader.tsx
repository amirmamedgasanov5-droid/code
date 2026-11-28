
import React, { useEffect } from 'react';
import { User, Survey, SurveyResponse, Grade } from '../types';
import { db } from '../firebase';
import { collection, query, where, getDocs, addDoc, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../src/utils/firestoreError';

interface SurveyAutoGraderProps {
  user: User;
}

export const SurveyAutoGrader: React.FC<SurveyAutoGraderProps> = ({ user }) => {
  useEffect(() => {
    if (user.role !== 'student') return;

    const checkOverdueSurveys = async () => {
      try {
        // 1. Fetch active surveys
        const surveysQuery = query(collection(db, 'surveys'), where('active', '==', true));
        const surveysSnap = await getDocs(surveysQuery);
        const activeSurveys = surveysSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Survey));

        // 2. Fetch student's responses
        const responsesQuery = query(
          collection(db, 'survey_responses'), 
          where('studentUid', '==', user.uid)
        );
        const responsesSnap = await getDocs(responsesQuery);
        const answeredSurveyIds = new Set(responsesSnap.docs.map(doc => doc.data().surveyId));

        // 3. Fetch student's survey-related grades
        const gradesQuery = query(
          collection(db, 'grades'), 
          where('studentId', '==', user.id)
        );
        const gradesSnap = await getDocs(gradesQuery);
        const gradedSurveyIds = new Set(
          gradesSnap.docs
            .map(doc => doc.data() as Grade)
            .filter(g => g.surveyId)
            .map(g => g.surveyId as string)
        );

        const now = new Date();
        const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;

        for (const survey of activeSurveys) {
          const createdAt = new Date(survey.createdAt);
          const isOverdue = (now.getTime() - createdAt.getTime()) > twoDaysInMs;

          if (isOverdue && !answeredSurveyIds.has(survey.id) && !gradedSurveyIds.has(survey.id)) {
            // Add a grade of 2
            await addDoc(collection(db, 'grades'), {
              studentId: user.id,
              studentUsername: user.username || user.id,
              subject: 'SORĞU',
              score: 2,
              date: now.toISOString(),
              comment: `"${survey.title}" опрос не пройден вовремя — оценка выставлена автоматически.`,
              teacherId: 'SYSTEM',
              surveyId: survey.id
            });

            // Add notification
            await addDoc(collection(db, 'notifications'), {
              userId: user.id,
              title: "Avtomatik Qiymət",
              message: `"${survey.title}" опрос не пройден в течение 2 дней, в журнал выставлена оценка «2».`,
              type: 'warning',
              read: false,
              createdAt: now.toISOString()
            });
            
            console.log(`Added automatic grade 2 for survey ${survey.id} to student ${user.id}`);
          }
        }
      } catch (error) {
        console.error("Error in SurveyAutoGrader:", error);
      }
    };

    // Run check on mount and then every hour if the tab stays open
    checkOverdueSurveys();
    const interval = setInterval(checkOverdueSurveys, 3600000); 

    return () => clearInterval(interval);
  }, [user.id, user.uid, user.role]);

  return null; // This component doesn't render anything
};
