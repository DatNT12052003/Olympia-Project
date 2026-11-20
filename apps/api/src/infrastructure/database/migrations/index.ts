import { EnableExtensions1794960000000 } from './1794960000000-EnableExtensions';
import { CreateIdentityTables1794970000000 } from './1794970000000-CreateIdentityTables';
import { CreateRoomTables1794980000000 } from './1794980000000-CreateRoomTables';
import { CreateQuestionBankTables1794990000000 } from './1794990000000-CreateQuestionBankTables';
import { CreateMatchTables1795000000000 } from './1795000000000-CreateMatchTables';
import { MatchEndReasonCompleted1795010000000 } from './1795010000000-MatchEndReasonCompleted';
import { ResultsAndAdministration1795020000000 } from './1795020000000-ResultsAndAdministration';

/** Danh sách migration theo thứ tự; thêm migration mới vào cuối. */
export const migrations = [
  EnableExtensions1794960000000,
  CreateIdentityTables1794970000000,
  CreateRoomTables1794980000000,
  CreateQuestionBankTables1794990000000,
  CreateMatchTables1795000000000,
  MatchEndReasonCompleted1795010000000,
  ResultsAndAdministration1795020000000,
];
